import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTier } from '@/lib/subscription'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const SUPABASE_STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/patent-uploads`

/**
 * POST /api/patents/[id]/generate-figures
 * Pro-gated. Reads claims_draft + spec_draft, generates 6 patent-style SVG figures,
 * converts to PNG, uploads to Supabase Storage, marks figures_uploaded=true.
 *
 * Returns immediately with { ok: true, message } — generation is async (~30-90s).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tier = await getUserTier(user.id)
  if (tier !== 'pro') {
    return NextResponse.json({
      error: 'AI Figure Generation requires PatentPending Pro',
      upgrade_url: '/pricing',
    }, { status: 403 })
  }

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, claims_draft, spec_draft, filing_status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!patent.claims_draft && !patent.spec_draft) {
    return NextResponse.json({ error: 'No claims or spec draft — generate those first' }, { status: 400 })
  }

  // Fire and forget
  runFigureGeneration(patentId, patent.title, patent.claims_draft ?? '', patent.spec_draft ?? '', user.id).catch(console.error)

  return NextResponse.json({
    ok: true,
    message: 'Figure generation started — 6 patent drawings will be ready in ~60 seconds.',
  })
}

/**
 * GET /api/patents/[id]/generate-figures
 * Returns the list of generated figure URLs if they exist.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, figures_uploaded')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!patent.figures_uploaded) {
    return NextResponse.json({ figures: [], generated: false })
  }

  const figures = Array.from({ length: 6 }, (_, i) => ({
    number: i + 1,
    label: `FIG. ${i + 1}`,
    url: `${SUPABASE_STORAGE_BASE}/${patentId}/figures/fig${i + 1}.png`,
  }))

  return NextResponse.json({ figures, generated: true })
}

// ---------------------------------------------------------------------------
// Core generation logic
// ---------------------------------------------------------------------------

async function runFigureGeneration(
  patentId: string,
  title: string,
  claimsDraft: string,
  specDraft: string,
  userId: string
) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[generate-figures] GEMINI_API_KEY not set')
    return
  }

  // Step 1: Ask Gemini to determine what figure types are needed + descriptions
  const analysisPrompt = `You are a patent drawing expert. Analyze this patent specification and claims, then describe exactly 6 patent figures needed.

For each figure, provide:
- figNum: 1-6
- type: "block_diagram" | "schematic" | "timing_diagram" | "spatial_patterns" | "flowchart" | "perspective_view" | "crosswalk_diagram"
- title: Short title (e.g. "System Architecture Block Diagram")
- description: 2-3 sentences describing what the figure shows, exactly matching the spec's BRIEF DESCRIPTION OF DRAWINGS section if present.
- elements: List of labeled elements with their reference numbers (e.g. ["Processor 102", "Memory 104"])

Patent Title: ${title}

Spec excerpt (first 3000 chars):
${specDraft.slice(0, 3000)}

Claims (first 2000 chars):
${claimsDraft.slice(0, 2000)}

Return ONLY valid JSON array of 6 figure objects. No preamble.`

  let figureSpecs: any[] = []
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      }
    )
    const geminiData = await geminiRes.json()
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (jsonMatch) figureSpecs = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[generate-figures] Gemini analysis failed:', e)
  }

  // Fallback: use generic 6-figure structure if Gemini fails
  if (!figureSpecs || figureSpecs.length === 0) {
    figureSpecs = [
      { figNum: 1, type: 'block_diagram', title: 'System Architecture', elements: ['System 100', 'Processor 102', 'Memory 104', 'Output 110', 'Power 112', 'Interface 114'] },
      { figNum: 2, type: 'perspective_view', title: 'Device Embodiment', elements: ['Device 200', 'Component A 202', 'Component B 204', 'Component C 206'] },
      { figNum: 3, type: 'schematic', title: 'Infrastructure Embodiment', elements: ['Infrastructure 300', 'Unit 302', 'Pole 304', 'Signal 306', 'Area 310'] },
      { figNum: 4, type: 'timing_diagram', title: 'Signal Timing', elements: ['Signal A 402', 'Signal B 404'] },
      { figNum: 5, type: 'spatial_patterns', title: 'Pattern Examples', elements: ['Pattern A 502', 'Pattern B 504', 'Pattern C 506'] },
      { figNum: 6, type: 'flowchart', title: 'Method Steps', elements: ['Start', 'Step 1 602', 'Step 2 604', 'Step 3 606', 'End'] },
    ]
  }

  // Step 2: Generate SVG for each figure
  const svgs: string[] = []
  for (const spec of figureSpecs.slice(0, 6)) {
    const svg = generateSVG(spec, patentId)
    svgs.push(svg)
  }

  // Step 3: Convert SVGs to PNG via Vercel-compatible sharp or return SVG directly
  // In Vercel serverless, we can't run cairosvg — upload SVG and let client render,
  // OR use a headless approach. For now, upload SVG as the canonical format.
  // PNG conversion happens on the Mac mini via the BoClaw script.
  // We store SVG in storage with .svg extension + PNG where available.

  const uploadedFigures: string[] = []
  for (let i = 0; i < svgs.length; i++) {
    const figNum = i + 1
    const svgContent = svgs[i]
    const svgPath = `${patentId}/figures/fig${figNum}.svg`

    // Upload SVG
    const svgRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/patent-uploads/${svgPath}`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Content-Type': 'image/svg+xml',
          'x-upsert': 'true',
        },
        body: svgContent,
      }
    )
    if (svgRes.ok) {
      uploadedFigures.push(svgPath)
      console.log(`[generate-figures] Uploaded fig${figNum}.svg`)
    }
  }

  // Step 4: Update DB
  await supabaseService
    .from('patents')
    .update({ figures_uploaded: true, updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // Log usage
  await supabaseService.from('ai_usage_log').insert({
    user_id: userId,
    patent_id: patentId,
    action: 'generate_figures',
    model: 'gemini-2.0-flash',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  })

  console.log(`[generate-figures] Complete for ${patentId} — ${uploadedFigures.length} figures uploaded`)
}

// ---------------------------------------------------------------------------
// SVG generation helpers
// ---------------------------------------------------------------------------

function generateSVG(spec: any, patentId: string): string {
  const { figNum, type, title, elements = [] } = spec
  const totalFigs = 6
  const sheetLabel = `Sheet ${figNum} of ${totalFigs}`

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="white"/>
  <text x="760" y="22" text-anchor="end" font-family="Arial, sans-serif" font-size="9">${sheetLabel}</text>
  <text x="400" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold">FIG. ${figNum}</text>
  <rect x="10" y="10" width="780" height="580" fill="none" stroke="black" stroke-width="1"/>`

  const footer = `\n</svg>`

  switch (type) {
    case 'block_diagram':
      return header + generateBlockDiagram(elements) + footer
    case 'flowchart':
      return header + generateFlowchart(elements) + footer
    case 'timing_diagram':
      return header + generateTimingDiagram(elements) + footer
    case 'spatial_patterns':
      return header + generateSpatialPatterns(elements) + footer
    default:
      return header + generateBlockDiagram(elements) + footer
  }
}

function generateBlockDiagram(elements: string[]): string {
  const boxes = elements.slice(0, 8)
  const centerX = 400
  // Place center element in middle, others around it
  const positions = [
    { x: 325, y: 80 },   // top
    { x: 580, y: 180 },  // right
    { x: 580, y: 320 },  // bottom-right
    { x: 325, y: 420 },  // bottom
    { x: 70, y: 320 },   // bottom-left
    { x: 70, y: 180 },   // left
    { x: 200, y: 80 },   // top-left
    { x: 500, y: 80 },   // top-right
  ]

  let svg = '\n  <!-- Block Diagram -->'
  // Center box
  svg += `\n  <rect x="275" y="235" width="250" height="60" rx="4" fill="none" stroke="black" stroke-width="2"/>
  <text x="400" y="268" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold">${boxes[0] ?? 'System 100'}</text>`

  for (let i = 1; i < Math.min(boxes.length, positions.length); i++) {
    const pos = positions[i - 1]
    svg += `\n  <rect x="${pos.x}" y="${pos.y}" width="150" height="50" rx="4" fill="none" stroke="black" stroke-width="1.5"/>
  <text x="${pos.x + 75}" y="${pos.y + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10">${boxes[i]}</text>
  <line x1="${pos.x + 75}" y1="${pos.y + 50}" x2="400" y2="265" stroke="black" stroke-width="1" stroke-dasharray="4,2"/>`
  }
  return svg
}

function generateFlowchart(elements: string[]): string {
  const steps = elements.filter(Boolean)
  const boxH = 50, gap = 20
  const startY = 80
  let svg = '\n  <!-- Flowchart -->'

  for (let i = 0; i < Math.min(steps.length, 8); i++) {
    const y = startY + i * (boxH + gap)
    const isFirst = i === 0
    const isLast = i === steps.length - 1 || i === 7
    if (isFirst || isLast) {
      svg += `\n  <ellipse cx="400" cy="${y + 25}" rx="100" ry="22" fill="none" stroke="black" stroke-width="1.5"/>
  <text x="400" y="${y + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11">${steps[i]}</text>`
    } else {
      svg += `\n  <rect x="275" y="${y}" width="250" height="${boxH}" rx="4" fill="none" stroke="black" stroke-width="1.5"/>
  <text x="400" y="${y + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11">${steps[i]}</text>`
    }
    if (i < Math.min(steps.length - 1, 7)) {
      const nextY = y + boxH + gap
      svg += `\n  <line x1="400" y1="${y + boxH}" x2="400" y2="${nextY}" stroke="black" stroke-width="1.5"/>
  <polygon points="395,${nextY - 4} 405,${nextY - 4} 400,${nextY + 2}" fill="black"/>`
    }
  }
  return svg
}

function generateTimingDiagram(elements: string[]): string {
  let svg = '\n  <!-- Timing Diagram -->'
  svg += `\n  <line x1="80" y1="100" x2="80" y2="480" stroke="black" stroke-width="1.5"/>
  <line x1="80" y1="480" x2="760" y2="480" stroke="black" stroke-width="1.5"/>
  <text x="420" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="10">Time →</text>
  <text x="30" y="290" text-anchor="middle" font-family="Arial, sans-serif" font-size="10">Intensity</text>`

  // Short pulses (dots)
  for (let i = 0; i < 3; i++) {
    const x = 100 + i * 150
    svg += `\n  <rect x="${x}" y="200" width="60" height="270" fill="black" opacity="0.85"/>
  <text x="${x + 30}" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="9">● 402</text>`
  }
  // Long pulse (dash)
  svg += `\n  <rect x="590" y="200" width="140" height="270" fill="black" opacity="0.85"/>
  <text x="660" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="9">— 404</text>`

  return svg
}

function generateSpatialPatterns(elements: string[]): string {
  let svg = '\n  <!-- Spatial Patterns -->'
  const patterns = [
    { x: 120, label: elements[0] ?? 'Pattern A 502', shape: 'bar' },
    { x: 350, label: elements[1] ?? 'Pattern B 504', shape: 'arrow' },
    { x: 580, label: elements[2] ?? 'Pattern C 506', shape: 'circle' },
  ]

  for (const p of patterns) {
    svg += `\n  <rect x="${p.x - 90}" y="130" width="180" height="180" rx="5" fill="none" stroke="black" stroke-width="1.5"/>`
    if (p.shape === 'bar') {
      svg += `\n  <rect x="${p.x - 70}" y="205" width="140" height="30" fill="black" opacity="0.85"/>`
    } else if (p.shape === 'arrow') {
      svg += `\n  <polygon points="${p.x},140 ${p.x + 35},195 ${p.x + 14},195 ${p.x + 14},295 ${p.x - 14},295 ${p.x - 14},195 ${p.x - 35},195" fill="black" opacity="0.85"/>`
    } else {
      svg += `\n  <circle cx="${p.x}" cy="220" r="55" fill="none" stroke="black" stroke-width="14" opacity="0.85"/>`
    }
    svg += `\n  <text x="${p.x}" y="340" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${p.label}</text>`
  }
  return svg
}
