#!/usr/bin/env tsx
/**
 * scripts/sync-feature-catalog.ts — P25: Feature Catalog Auto-Sync
 *
 * Usage:
 *   npx tsx scripts/sync-feature-catalog.ts
 *   npx tsx scripts/sync-feature-catalog.ts --since="48 hours ago"
 *   npx tsx scripts/sync-feature-catalog.ts --commit=<sha>
 *
 * Runs after queue item completion to detect new features from git commits.
 * Uses Gemini Flash to extract feature info from commit messages.
 */

import { execSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import * as path from 'path'

// Load .env.local manually (no dotenv dep needed)
function loadEnv(envPath: string) {
  try {
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* env file not found — rely on existing process.env */ }
}
loadEnv(path.join(__dirname, '..', '.env.local'))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not set — aborting')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Supabase env vars not set — aborting')
  process.exit(1)
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Parse CLI args
const args = process.argv.slice(2)
const sinceArg = args.find(a => a.startsWith('--since='))?.split('=')[1] ?? '24 hours ago'
const commitArg = args.find(a => a.startsWith('--commit='))?.split('=')[1]

// ─── Step 1: Get recent commits ─────────────────────────────────────────────

function getRecentCommits(): string[] {
  try {
    let gitCmd: string
    if (commitArg) {
      gitCmd = `git log --oneline ${commitArg}^..${commitArg}`
    } else {
      gitCmd = `git log --since="${sinceArg}" --oneline`
    }
    const output = execSync(gitCmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
    return output.trim().split('\n').filter(Boolean)
  } catch (err) {
    console.error('❌ git log failed:', err)
    return []
  }
}

// ─── Step 2: Use Gemini Flash to extract features ───────────────────────────

interface DetectedFeature {
  feature_key: string
  feature_name: string
  description: string
  category: string
  tier_required: string
  commit_ref: string
}

async function extractFeaturesFromCommits(commits: string[]): Promise<DetectedFeature[]> {
  if (commits.length === 0) return []

  const commitList = commits.join('\n')
  const prompt = `You are analyzing git commit messages to extract new features shipped to PatentPending.app.

Commits (format: <sha> <message>):
${commitList}

Look for commits with prefixes like: feat:, add:, build:, P\\d+: (project numbers)
Skip: fix:, chore:, docs:, refactor:, hotfix:

For each NEW FEATURE detected, return a JSON array with objects:
{
  "feature_key": "snake_case_identifier",
  "feature_name": "Human Readable Name",
  "description": "One sentence description of what this feature does",
  "category": "core|marketing|analytics|operations|integrations",
  "tier_required": "free|paid|admin",
  "commit_ref": "<first 7 chars of sha>"
}

Rules:
- feature_key must be lowercase_snake_case, max 40 chars
- If no features found, return []
- category: core=patent workflow, operations=admin/infra, analytics=metrics/reporting
- tier_required: paid=requires subscription, admin=internal only, free=all users

Return ONLY valid JSON array, no markdown, no explanation.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('❌ Gemini API error:', err)
    return []
  }

  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'

  try {
    // Strip potential markdown code fences
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean) as DetectedFeature[]
  } catch {
    console.error('❌ Failed to parse Gemini response:', text.slice(0, 200))
    return []
  }
}

// ─── Step 3: Upsert into feature_catalog ────────────────────────────────────

async function syncFeatures(features: DetectedFeature[]): Promise<void> {
  if (features.length === 0) {
    console.log('ℹ️  No new features detected')
    return
  }

  console.log(`🔍 Detected ${features.length} feature(s) from commits:`)

  for (const f of features) {
    // Check if already exists
    const { data: existing } = await svc
      .from('feature_catalog')
      .select('feature_key')
      .eq('feature_key', f.feature_key)
      .maybeSingle()

    if (existing) {
      console.log(`  ⏭️  Skipping ${f.feature_key} (already in catalog)`)
      continue
    }

    // Insert new feature
    const { error } = await svc.from('feature_catalog').insert({
      feature_key: f.feature_key,
      feature_name: f.feature_name,
      description: f.description,
      category: f.category,
      tier_required: f.tier_required,
      commit_ref: f.commit_ref,
      status: 'available',
      deployed_at: new Date().toISOString(),
      applies_to: ['pp.app'],
    })

    if (error) {
      console.error(`  ❌ Failed to insert ${f.feature_key}:`, error.message)
    } else {
      console.log(`  ✅ Added: ${f.feature_name} [${f.category}] (${f.feature_key})`)
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Feature Catalog Auto-Sync (since: "${sinceArg}")`)
  console.log('─'.repeat(50))

  const commits = getRecentCommits()
  if (commits.length === 0) {
    console.log('ℹ️  No recent commits found')
    return
  }

  console.log(`📋 Found ${commits.length} recent commit(s)`)
  commits.slice(0, 5).forEach(c => console.log(`  ${c}`))
  if (commits.length > 5) console.log(`  ... and ${commits.length - 5} more`)

  const features = await extractFeaturesFromCommits(commits)
  await syncFeatures(features)

  console.log('─'.repeat(50))
  console.log('✅ Sync complete')
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
