export interface Finding {
  pattern: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  roast: string
}

export interface HeuristicResult {
  score: number
  findings: Finding[]
}

const BUZZWORDS: { word: string; pattern: RegExp }[] = [
  { word: 'Revolutionize', pattern: /\brevolutioniz(?:e|ing|ed)?\b/i },
  { word: 'Seamless', pattern: /\bseamless(?:ly)?\b/i },
  { word: 'Unlock the power of', pattern: /\bunlock(?:ing)?\s+the\s+power\s+of\b/i },
  { word: 'Elevate your', pattern: /\belevat(?:e|ing)\s+your\b/i },
  { word: 'Supercharge', pattern: /\bsupercharg(?:e|ing|ed)?\b/i },
  { word: 'Next-generation', pattern: /\bnext[- ]generation\b/i },
  { word: 'Cutting-edge', pattern: /\bcutting[- ]edge\b/i },
  { word: 'All-in-one platform', pattern: /\ball[- ]in[- ]one\s+(?:platform|solution|tool)\b/i },
  { word: 'Built for the future', pattern: /\bbuilt\s+for\s+the\s+future\b/i },
  { word: 'Say goodbye to', pattern: /\bsay\s+goodbye\s+to\b/i },
  { word: 'Game-changer', pattern: /\bgame[- ]changer\b/i },
  { word: 'Harness the power', pattern: /\bharness(?:ing)?\s+the\s+power\b/i }
]

export function runHeuristics(html: string, visibleText: string): HeuristicResult {
  const findings: Finding[] = []
  let totalSignalPoints = 0

  // 1. Tailwind class soup (elements with 14+ classes)
  const classMatches = html.match(/class=(?:'([^']+)'|"([^"]+)")/g) || []
  let maxClassCount = 0
  let worstClassSample = ''
  let soupElementsCount = 0

  for (const m of classMatches) {
    const raw = m.replace(/^class=['"]|['"]$/g, '')
    const tokens = raw.trim().split(/\s+/).filter(Boolean)
    if (tokens.length > maxClassCount) {
      maxClassCount = tokens.length
      worstClassSample = raw
    }
    if (tokens.length >= 14) {
      soupElementsCount++
    }
  }

  if (maxClassCount >= 18 || soupElementsCount >= 5) {
    totalSignalPoints += 14
    findings.push({
      pattern: 'Tailwind Utility Class Soup',
      severity: maxClassCount > 25 ? 'high' : 'medium',
      evidence: `Found ${soupElementsCount} elements with heavy class soup (peak: ${maxClassCount} classes: "${worstClassSample.slice(0, 90)}...")`,
      roast: 'When your HTML class attribute is longer than War and Peace, AI definitely wrote it.'
    })
  }

  // 2. Default shadcn / Radix / Lucide
  const hasShadcnRadix =
    /data-radix-|lucide[-_]|@radix-ui|lucide-react|lucide-vue/i.test(html) ||
    /class="[^"]*(?:bg-background|text-foreground|rounded-md border border-input)[^"]*"/i.test(html)

  if (hasShadcnRadix) {
    totalSignalPoints += 12
    findings.push({
      pattern: 'Shadcn / Radix / Lucide Uniformity',
      severity: 'medium',
      evidence: 'Detected Radix UI primitives, Lucide icons, or default shadcn utility variable conventions.',
      roast: 'The holy trinity of vibe-coding: copy-pasting shadcn components until it looks like Stripe.'
    })
  }

  // 3. Default fonts only (Inter / Geist / system-ui, no custom typography)
  const fontsMentioned = (html.match(/font-(?:sans|geist|inter)|family=(?:Inter|Geist)/gi) || []).map(f => f.toLowerCase())
  const hasCustomFont = /family=(?!(?:Inter|Geist|Roboto)(?:&|%|"))[A-Z][a-zA-Z+]+/i.test(html) ||
    /@font-face/i.test(html)

  if (fontsMentioned.length > 0 && !hasCustomFont) {
    totalSignalPoints += 8
    findings.push({
      pattern: 'Zero Typography Craft (Inter / Geist Default)',
      severity: 'low',
      evidence: 'Landing page exclusively leans on default Inter, Geist, or generic sans-serif.',
      roast: 'Inter again. Bold choice for someone who couldn\'t find Google Fonts.'
    })
  }

  // 4. Gradient text on headings (bg-clip-text + text-transparent)
  const gradientTextRegex = /bg-clip-text\s+text-transparent|\btext-transparent\s+bg-clip-text/i
  if (gradientTextRegex.test(html) || /class="[^"]*bg-gradient-to-[^"]*text-transparent[^"]*"/i.test(html)) {
    totalSignalPoints += 12
    findings.push({
      pattern: 'Gradient Text Syndrome',
      severity: 'high',
      evidence: 'Headings styled with "bg-clip-text text-transparent bg-gradient-to-...".',
      roast: 'Because plain readable text just doesn\'t scream "revolutionary AI startup" enough.'
    })
  }

  // 5. Purple->blue / indigo->pink gradients
  const syntheticGradients =
    /(?:from-(?:purple|indigo|violet)-\d{3}\s+to-(?:blue|cyan|pink)-\d{3})|(?:from-[#0-9a-fA-F]+\s+to-[#0-9a-fA-F]+)/i.test(html) ||
    /(?:#7928ca|#ff0080|#6366f1.*#ec4899)/i.test(html)

  if (syntheticGradients) {
    totalSignalPoints += 10
    findings.push({
      pattern: 'Synthetic Cyber-Sunset Palette',
      severity: 'medium',
      evidence: 'Purple-to-blue or indigo-to-pink synthetic gradient classes detected.',
      roast: 'Every AI startup drinks the exact same purple-to-blue Kool-Aid.'
    })
  }

  // 6. Blurred absolute-positioned background blobs
  const blobRegex = /(?:blur-(?:2xl|3xl)[^"]*rounded-full|rounded-full[^"]*blur-(?:2xl|3xl))/i
  if (blobRegex.test(html) || /class="[^"]*absolute[^"]*blur-3xl[^"]*"/i.test(html)) {
    totalSignalPoints += 15
    findings.push({
      pattern: 'Atmospheric Blurred Blob',
      severity: 'high',
      evidence: 'Found absolute-positioned "blur-3xl rounded-full" ambient glow divs.',
      roast: 'Ah yes, the obligatory blur-3xl blob filling the void where personality should be.'
    })
  }

  // 7. Identical rounded-xl/2xl card grids (3 or 4 columns)
  const cardGridRegex = /(?:grid-cols-1\s+(?:md|lg):grid-cols-3|grid-cols-3|grid-cols-4)[^"]*gap-\d+[^"]*(?:rounded-xl|rounded-2xl)/i
  const cardOccurrences = (html.match(/rounded-(?:xl|2xl)\s+border\s+p-\d+/gi) || []).length

  if (cardGridRegex.test(html) || cardOccurrences >= 3) {
    totalSignalPoints += 10
    findings.push({
      pattern: 'Clone Army Feature Grid',
      severity: 'medium',
      evidence: `Uniform 3/4-column grid with identical rounded-xl/2xl cards detected (${cardOccurrences} cards match).`,
      roast: 'Three identical cards walk into a viewport; none of them have an original thought.'
    })
  }

  // 8. Emoji used as icons in feature lists
  const emojiIconMatches = html.match(/(?:<span[^>]*>[🚀⚡💡🤖✨📈🔒🎯🎉🔥💎🛠️]<\/span>|<div[^>]*>[🚀⚡💡🤖✨📈🔒🎯🎉🔥💎🛠️]<\/div>)/u) ||
    visibleText.match(/[🚀⚡💡🤖✨📈🔒🎯]\s+[A-Z][a-z]+/g)

  if (emojiIconMatches && emojiIconMatches.length >= 2) {
    totalSignalPoints += 9
    findings.push({
      pattern: 'Emoji Feature Icons',
      severity: 'medium',
      evidence: `Features decorated with raw emojis (${emojiIconMatches.slice(0, 3).join(', ')}) instead of custom iconography.`,
      roast: 'Hiring a designer is hard; pasting 🚀 into a div is free.'
    })
  }

  // 9. Pill badge above the hero headline ("✨ Now in beta")
  const pillBadgeRegex = /(?:rounded-full[^"]*(?:border|bg-)[^"]*>[^<]*(?:✨|Now in [Bb]eta|v[0-9]\.[0-9]|Introducing|Announcing)[^<]*<\/)/i
  if (pillBadgeRegex.test(html) || /(?:✨\s*(?:Now in beta|Introducing|v[0-9]|Powered by AI))/i.test(visibleText)) {
    totalSignalPoints += 12
    findings.push({
      pattern: 'Sparkle Pill Badge ("✨ Now in Beta")',
      severity: 'high',
      evidence: 'Found hero sparkle badge / pill announce banner above headline.',
      roast: 'The mandatory sparkle badge: 90% vibes, 10% product.'
    })
  }

  // 10. Boilerplate section order
  const lowerHtml = html.toLowerCase()
  const heroIndex = lowerHtml.indexOf('hero')
  const featureIndex = lowerHtml.indexOf('feature')
  const testimonialIndex = lowerHtml.indexOf('testimonial')
  const pricingIndex = lowerHtml.indexOf('pricing')
  const faqIndex = lowerHtml.indexOf('faq')

  if (heroIndex !== -1 && featureIndex > heroIndex && testimonialIndex > featureIndex && pricingIndex > testimonialIndex) {
    totalSignalPoints += 11
    findings.push({
      pattern: 'Algorithmic Section Blueprint',
      severity: 'high',
      evidence: 'Sections follow textbook AI sequence: Hero → Features → Testimonials → Pricing.',
      roast: 'The AI followed the generic SaaS template so strictly it hurts.'
    })
  }

  // 11. Placeholder testimonials / fake avatars
  const fakePeople = visibleText.match(/(?:Jane\s+Doe|John\s+Doe|CEO\s+at\s+Acme|CEO\s+at\s+TechCorp|lorem\s+ipsum)/gi)
  const unsplashAvatar = /images\.unsplash\.com\/photo-[a-zA-Z0-9_-]+\?.*(?:avatar|face|crop=faces)/i.test(html)

  if (fakePeople || unsplashAvatar) {
    totalSignalPoints += 14
    findings.push({
      pattern: 'Faux Social Proof & Stock Avatars',
      severity: 'high',
      evidence: `Found placeholder profile artifacts (${fakePeople ? fakePeople.slice(0, 2).join(', ') : 'Unsplash portrait avatar'}).`,
      roast: 'Jane Doe from TechCorp is raving about software that doesn\'t exist.'
    })
  }

  // 12. Missing details (default favicon, missing alt text, generic meta)
  let missingDetailsCount = 0
  const evidencePieces: string[] = []

  if (!/<link[^>]*rel=["'](?:shortcut )?icon["']/i.test(html)) {
    missingDetailsCount++
    evidencePieces.push('no custom favicon link')
  }
  const imgWithoutAlt = (html.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length
  if (imgWithoutAlt >= 2) {
    missingDetailsCount++
    evidencePieces.push(`${imgWithoutAlt} images missing alt text`)
  }
  if (!/<meta[^>]*name=["']description["'][^>]*content=["'][^"']{10,}["']/i.test(html)) {
    missingDetailsCount++
    evidencePieces.push('generic or absent meta description')
  }

  if (missingDetailsCount >= 2) {
    totalSignalPoints += 7
    findings.push({
      pattern: 'Neglected Production Polish',
      severity: 'low',
      evidence: evidencePieces.join(', '),
      roast: 'Skipped alt tags and left the default favicon—classic robot haste.'
    })
  }

  // 13. Copy Buzzwords
  const matchedBuzzwords: string[] = []
  for (const item of BUZZWORDS) {
    if (item.pattern.test(visibleText)) {
      matchedBuzzwords.push(item.word)
    }
  }

  if (matchedBuzzwords.length >= 2) {
    const buzzwordScore = Math.min(25, matchedBuzzwords.length * 6)
    totalSignalPoints += buzzwordScore
    findings.push({
      pattern: 'AI Slop Buzzword Bingo',
      severity: matchedBuzzwords.length >= 4 ? 'high' : 'medium',
      evidence: `Contains multiple synthetic marketing buzzwords: ${matchedBuzzwords.slice(0, 5).map(w => `"${w}"`).join(', ')}.`,
      roast: 'Your landing page copy contains more corporate AI filler than a LinkedIn influencer\'s memoir.'
    })
  }

  // 14. Rhetorical copy tropes: Em-dash overuse, "It's not just X, it's Y"
  const emDashCount = (visibleText.match(/—|--/g) || []).length
  const notJustRegex = /it(?:'s|\s+is)\s+not\s+just\s+[^,.]+,?\s+it(?:'s|\s+is)\s+/i
  const hasNotJust = notJustRegex.test(visibleText)

  if (emDashCount >= 4 || hasNotJust) {
    totalSignalPoints += 9
    findings.push({
      pattern: 'Formulaic Rhetorical Flourishes',
      severity: 'medium',
      evidence: `${hasNotJust ? '"It\'s not just X, it\'s Y" pattern detected. ' : ''}${emDashCount >= 4 ? `${emDashCount} em-dashes found.` : ''}`.trim(),
      roast: 'The classic "It\'s not just X, it\'s Y"—the definitive fingerprint of ChatGPT doing copy.'
    })
  }

  // Calculate normalized local score 0–100
  // Higher signal points = higher slop score
  const clampedScore = Math.min(100, Math.max(0, Math.round(totalSignalPoints)))

  return {
    score: clampedScore,
    findings
  }
}

