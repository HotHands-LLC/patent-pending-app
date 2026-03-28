/**
 * P19 Task 3: Generate 7 SEO blog posts with Gemini Flash and insert as drafts.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''

const svc = createClient(SUPABASE_URL, SUPABASE_KEY)

const POSTS = [
  {
    title: 'How Long Does a Patent Last? (And What Happens After It Expires)',
    slug: 'how-long-does-a-patent-last-what-happens-after-expires',
    category: 'patent-basics',
    seo_title: 'How Long Does a Patent Last? Lifespan & Expiration Explained',
    seo_description: 'Learn how long utility, design, and plant patents last, what maintenance fees keep them alive, and what happens when a patent expires.',
  },
  {
    title: 'Patent Claims: The Difference Between Independent and Dependent Claims',
    slug: 'patent-claims-independent-vs-dependent',
    category: 'patent-drafting',
    seo_title: "Independent vs Dependent Patent Claims: What's the Difference?",
    seo_description: 'Understand the critical difference between independent and dependent patent claims — and why it matters for the scope of your protection.',
  },
  {
    title: 'What Is a Patent Pending Status? What It Means and What It Doesn\'t',
    slug: 'what-is-patent-pending-status',
    category: 'patent-basics',
    seo_title: 'What Does "Patent Pending" Mean? A Clear Explanation',
    seo_description: 'Patent pending means you\'ve filed but not yet received protection. Learn what rights you have, what you don\'t, and how to use the designation correctly.',
  },
  {
    title: 'Can You Patent an App? A Step-by-Step Guide for Software Inventors',
    slug: 'can-you-patent-an-app-software-inventors-guide',
    category: 'software-patents',
    seo_title: 'Can You Patent an App? Software Patent Guide for Inventors',
    seo_description: 'Yes, you can patent software and apps — but it\'s tricky. Learn the step-by-step process, what\'s patentable, and how to avoid rejection.',
  },
  {
    title: 'How to Do a Patent Search Before You File (Free Tools That Actually Work)',
    slug: 'how-to-do-patent-search-free-tools',
    category: 'patent-research',
    seo_title: 'How to Do a Patent Search for Free: Tools That Actually Work',
    seo_description: 'Before you file, search for prior art. Learn how to use USPTO, Google Patents, and other free tools to run a proper patent search yourself.',
  },
  {
    title: 'The True Cost of a Patent in 2026: Attorney Fees vs. DIY vs. AI',
    slug: 'cost-of-patent-2026-attorney-diy-ai',
    category: 'patent-costs',
    seo_title: 'How Much Does a Patent Cost in 2026? Attorney vs DIY vs AI',
    seo_description: 'A realistic breakdown of patent costs in 2026 — from filing fees to attorney costs to AI-assisted drafting. Find the right approach for your budget.',
  },
  {
    title: 'Continuation Patents Explained: How to Build a Patent Family',
    slug: 'continuation-patents-how-to-build-patent-family',
    category: 'patent-strategy',
    seo_title: 'Continuation Patents Explained: Building a Patent Family',
    seo_description: 'Continuation patents let you expand and refine your IP portfolio. Learn what continuations, divisionals, and CIPs are — and how to build a patent family.',
  },
]

function slugToText(s) {
  return s.replace(/-/g, ' ')
}

async function generatePost(post) {
  const prompt = `You are an expert patent educator writing an SEO-optimized blog post for patentpending.app — an AI-assisted patent management platform for inventors.

Write a blog post titled: "${post.title}"

Requirements:
- 1,500–2,000 words
- Return ONLY the HTML body content (no <html>, <head>, <body> tags)
- Use H2 and H3 tags for structure
- First paragraph (150 words max): directly answer what the title promises. Make it self-contained.
- H2 headers should be follow-on questions the reader would naturally have
- Educational tone — explain concepts clearly for smart non-lawyers
- DO NOT guarantee specific attorney fee amounts
- DO NOT use the phrase "pp.app" — only use "patentpending.app" when referencing the product
- End with a CTA section (H2: "Ready to Get Started?") linking to https://patentpending.app with anchor text "patentpending.app"
- The CTA should naturally invite the reader to try patentpending.app for their patent needs
- Write in clean, readable HTML with <p>, <h2>, <h3>, <ul>, <li>, <strong> tags
- Do not include markdown — only HTML

Category: ${slugToText(post.category)}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err}`)
  }

  const json = await res.json()
  const html = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return html
}

function estimateWords(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.split(' ').filter(w => w.length > 0).length
}

function estimateReadTime(words) {
  return Math.max(1, Math.round(words / 200))
}

async function run() {
  console.log(`Generating ${POSTS.length} blog posts with Gemini Flash...\n`)

  for (const post of POSTS) {
    console.log(`\n📝 Generating: ${post.title}`)
    
    let bodyHtml = ''
    let attempt = 0
    while (attempt < 3) {
      try {
        bodyHtml = await generatePost(post)
        break
      } catch (err) {
        attempt++
        console.error(`  Attempt ${attempt} failed: ${err.message}`)
        if (attempt < 3) {
          console.log(`  Retrying in 3s...`)
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }

    if (!bodyHtml) {
      console.error(`  ❌ Failed after 3 attempts, skipping.`)
      continue
    }

    const wordCount = estimateWords(bodyHtml)
    const readTime = estimateReadTime(wordCount)
    console.log(`  ✅ Generated ~${wordCount} words, ~${readTime} min read`)

    // Insert into blog_posts
    // Strip HTML for body_md (plain text fallback)
    const bodyMd = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    const { data, error } = await svc.from('blog_posts').insert({
      title: post.title,
      slug: post.slug,
      status: 'draft',
      category: post.category,
      body_html: bodyHtml,
      body_md: bodyMd,
      seo_title: post.seo_title,
      seo_description: post.seo_description,
      word_count: wordCount,
      read_time_minutes: readTime,
      created_by: 'patentclaw',
    }).select('id').single()

    if (error) {
      if (error.code === '23505') {
        console.log(`  ⚠️  Slug already exists, skipping.`)
      } else {
        console.error(`  ❌ Insert error: ${error.message}`)
      }
    } else {
      console.log(`  💾 Inserted with id: ${data.id}`)
    }

    // Brief pause between API calls
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log('\n✅ Done!')
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
