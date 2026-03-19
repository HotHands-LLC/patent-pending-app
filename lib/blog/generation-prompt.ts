/**
 * lib/blog/generation-prompt.ts
 * BlogClaw AEO (Answer Engine Optimization) generation prompt.
 * TODO: Wire into BlogClaw generation when the auto-generation pipeline ships.
 */

export const AEO_SYSTEM_PROMPT = `
BLOG POST FORMAT REQUIREMENTS (AEO — Answer Engine Optimization):

1. Title must be a direct question OR a clear answer statement.
   Good: "What is a Provisional Patent? Everything Inventors Need to Know"
   Bad: "Understanding Patent Filing in Today's World"

2. First paragraph (150 words max): answer the title question directly and completely.
   LLMs extract this as the featured snippet. Make it self-contained.

3. Use H2 headers as follow-on questions:
   "How long does a provisional patent last?"
   "What's the difference between provisional and non-provisional?"
   "How much does a provisional patent cost?"

4. Each H2 section: answer in the first 2 sentences, then elaborate.

5. Include one FAQ section at the bottom with 3-5 Q&A pairs in plain text.

6. Target topics that inventors actually search:
   - "how to write patent claims"
   - "what is prior art"
   - "provisional vs non-provisional patent"
   - "how much does a patent cost"
   - "what makes an invention patentable"
   - "how to do a patent search"
   - "what is patent pending"
   - "how long does it take to get a patent"

7. Never write generic industry overview posts. Every post answers a specific question.

Apply this format to all future post generation. Do not retroactively rewrite existing posts.
`.trim()
