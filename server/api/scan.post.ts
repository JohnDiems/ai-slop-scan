import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { validateUrl } from '../utils/ssrf'
import { runHeuristics, type Finding } from '../utils/heuristics'
import { fetchWebpage } from '../utils/browser'

interface RateLimitRecord {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitRecord>()
const cacheMap = new Map<string, { data: any; expiry: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 3600 * 1000 })
    return true
  }

  if (record.count >= 5) {
    return false
  }

  record.count++
  return true
}

function getCachedResult(url: string, hasKey: boolean = false) {
  const item = cacheMap.get(url)
  if (!item) return null
  if (Date.now() > item.expiry) {
    cacheMap.delete(url)
    return null
  }
  if (hasKey && item.data.provider === 'heuristic') {
    cacheMap.delete(url)
    return null
  }
  return item.data
}

function setCachedResult(url: string, data: any) {
  cacheMap.set(url, {
    data,
    expiry: Date.now() + 10 * 60 * 1000
  })
}

function getVerdict(score: number): string {
  if (score <= 20) return 'Handcrafted'
  if (score <= 40) return 'Mostly Human'
  if (score <= 60) return 'Suspicious'
  if (score <= 80) return 'Heavily Assisted'
  return 'Pure Slop'
}

interface LLMAnalysisResult {
  score: number
  categories: { name: string; score: number }[]
  findings: Finding[]
  summary: string
  provider: 'gemini' | 'claude' | 'ollama'
}

async function callOllama(params: {
  baseUrl: string
  model: string
  screenshotBase64?: string
  prompt: string
  systemPrompt: string
}): Promise<LLMAnalysisResult | null> {
  const { baseUrl, model, screenshotBase64, prompt, systemPrompt } = params
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '')

  try {
    let targetModel = model || 'llama3.2-vision'

    // Auto-detect available installed models if present
    try {
      const tagsController = new AbortController()
      const tagsTimeout = setTimeout(() => tagsController.abort(), 2500)
      const tagsRes = await fetch(`${cleanBaseUrl}/api/tags`, {
        signal: tagsController.signal
      })
      clearTimeout(tagsTimeout)

      if (tagsRes.ok) {
        const tagsData: any = await tagsRes.json()
        const availableModels: string[] = (tagsData.models || []).map((m: any) => m.name || m.model)

        if (availableModels.length > 0) {
          const directMatch = availableModels.find(m => m === targetModel || m.startsWith(`${targetModel}:`))
          if (!directMatch) {
            // Find best alternative: vision first, then any available LLM
            const visionMatch = availableModels.find(m => /vision|llava|minicpm|bakllava|vl/i.test(m))
            if (visionMatch) {
              targetModel = visionMatch
            } else if (availableModels[0]) {
              targetModel = availableModels[0]
            }
          }
        }
      }
    } catch {
      // Tags probe timed out or failed, continue with configured targetModel
    }

    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ]

    const userMessage: any = {
      role: 'user',
      content: prompt
    }

    if (screenshotBase64) {
      userMessage.images = [screenshotBase64]
    }

    messages.push(userMessage)

    const chatController = new AbortController()
    const chatTimeout = setTimeout(() => chatController.abort(), 90000)

    const res = await fetch(`${cleanBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.2
        }
      }),
      signal: chatController.signal
    })
    clearTimeout(chatTimeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      // If error is about vision/images not supported by model, retry without images
      if (screenshotBase64 && (errText.includes('image') || errText.includes('support') || res.status === 400)) {
        console.warn(`Ollama model ${targetModel} does not support images. Retrying text-only audit...`)
        return callOllama({
          baseUrl,
          model: targetModel,
          prompt,
          systemPrompt
        })
      }
      throw new Error(`Ollama HTTP ${res.status}: ${errText}`)
    }

    const data: any = await res.json()
    const rawContent = data.message?.content || '{}'
    const cleanedJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanedJson)

    return {
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      summary: parsed.summary || '',
      provider: 'ollama'
    }
  } catch (err: any) {
    console.warn(`Ollama inspection failed (${cleanBaseUrl}):`, err.message)
    return null
  }
}

async function callVisionLLM(params: {
  screenshotBase64: string
  mimeType: string
  prompt: string
  systemPrompt: string
  useOllama?: boolean
  ollamaBaseUrl?: string
  ollamaModel?: string
  geminiKey?: string
  anthropicKey?: string
}): Promise<LLMAnalysisResult | null> {
  const {
    screenshotBase64,
    mimeType,
    prompt,
    systemPrompt,
    useOllama,
    ollamaBaseUrl,
    ollamaModel,
    geminiKey,
    anthropicKey
  } = params

  // 1. Try Ollama first if enabled (local, private, free, no API key required)
  if (useOllama) {
    const ollamaResult = await callOllama({
      baseUrl: ollamaBaseUrl || 'http://localhost:11434',
      model: ollamaModel || 'llama3.2-vision',
      screenshotBase64,
      prompt,
      systemPrompt
    })
    if (ollamaResult) {
      return ollamaResult
    }
  }

  // 2. Try Google Gemini if key is available
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey })
      const contents = screenshotBase64
        ? [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: screenshotBase64
              }
            },
            prompt
          ]
        : [prompt]

      let response: any
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      } catch (err: any) {
        console.warn('gemini-3.5-flash fallback to gemini-flash-latest:', err.message)
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      }

      const rawText = response.text || '{}'
      const parsed = JSON.parse(rawText)
      return {
        score: typeof parsed.score === 'number' ? parsed.score : 50,
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        summary: parsed.summary || '',
        provider: 'gemini'
      }
    } catch (err: any) {
      console.warn('Gemini API call failed, attempting Anthropic if available:', err.message)
    }
  }

  // 2. Try Anthropic Claude if key is available
  if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const userContent = screenshotBase64
        ? [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (mimeType as any) || 'image/jpeg',
                data: screenshotBase64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        : [
            {
              type: 'text',
              text: prompt
            }
          ]

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1800,
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent as any
          }
        ]
      })

      const textContent = (response.content.find((c: any) => c.type === 'text') as any)?.text || '{}'
      const cleanedJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleanedJson)
      return {
        score: typeof parsed.score === 'number' ? parsed.score : 50,
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        summary: parsed.summary || '',
        provider: 'claude'
      }
    } catch (err: any) {
      console.warn('Anthropic API call failed:', err.message)
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  const forwardedHeader = getHeader(event, 'x-forwarded-for')
  const clientIp =
    (forwardedHeader ? forwardedHeader.split(',')[0]?.trim() : null) ||
    getHeader(event, 'x-real-ip') ||
    event.node.req.socket.remoteAddress ||
    '127.0.0.1'

  if (!checkRateLimit(clientIp)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limit reached: Maximum 5 scans per hour per IP. Please try again later.'
    })
  }

  const body = await readBody(event).catch(() => ({}))
  const mode = body?.mode === 'screenshot' ? 'screenshot' : 'link'

  const config = useRuntimeConfig()
  const useOllama = config.useOllama !== false && config.useOllama !== 'false' && process.env.USE_OLLAMA !== 'false'
  const ollamaBaseUrl = (config.ollamaBaseUrl as string) || process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const ollamaModel = (config.ollamaModel as string) || process.env.OLLAMA_MODEL || 'llama3.2-vision'
  const geminiKey = (config.geminiApiKey as string) || process.env.GEMINI_API_KEY || ''
  const anthropicKey = (config.anthropicApiKey as string) || process.env.ANTHROPIC_API_KEY || ''

  const SYSTEM_PROMPT = `You are a ruthless but fair web design critic who specializes in detecting AI-generated and vibe-coded websites. You receive a screenshot, trimmed HTML, and a list of heuristic findings. Evaluate how likely the site is AI-generated across these categories: Visual Design, Layout Structure, Copywriting, Code/Markup Quality, Originality. Score each 0–100 (100 = pure AI slop). Only flag patterns you can point to with concrete evidence. Do not guess. If the site shows clear human craft (custom illustrations, distinctive typography, unusual layout, specific real-world copy), lower the score. Return ONLY valid JSON matching the schema. Each roast must be one short, witty sentence: playful, never cruel.`

  // --- SCREENSHOT MODE ---
  if (mode === 'screenshot') {
    let imageBase64 = body?.image || ''
    let mimeType = 'image/png'

    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,')
      const mimeMatch = parts[0]?.match(/:(.*?)$/)
      if (mimeMatch && mimeMatch[1]) mimeType = mimeMatch[1]
      imageBase64 = parts[1] ?? ''
    }

    if (!imageBase64) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing image payload for screenshot analysis.'
      })
    }

    if (imageBase64.length > 7 * 1024 * 1024) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Image size exceeds maximum limit of 5MB.'
      })
    }

    const skippedMarkupFinding: Finding = {
      pattern: 'Markup Analysis Skipped',
      severity: 'low',
      evidence: 'Screenshot mode was used: DOM markup, CSS classes, and server headers were not inspected.',
      roast: 'No HTML code to roast, so your CSS utility crimes remain unprosecuted.'
    }

    const prompt = `Analyze this screenshot of a website. Markup analysis is skipped because only screenshot was provided.
Evaluate Visual Design, Layout Structure, Copywriting, and Originality (0-100 each). Set Code/Markup Quality to 0.
Return strictly valid JSON matching this structure:
{
  "score": number,
  "categories": [
    { "name": "Visual Design", "score": number },
    { "name": "Layout Structure", "score": number },
    { "name": "Copywriting", "score": number },
    { "name": "Code/Markup Quality", "score": 0 },
    { "name": "Originality", "score": number }
  ],
  "findings": [
    {
      "pattern": string,
      "severity": "low" | "medium" | "high",
      "evidence": string,
      "roast": string
    }
  ],
  "summary": string
}`

    const llmResult = await callVisionLLM({
      screenshotBase64: imageBase64,
      mimeType,
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      useOllama,
      ollamaBaseUrl,
      ollamaModel,
      geminiKey,
      anthropicKey
    })

    if (llmResult) {
      const finalScore = Math.min(100, Math.max(0, Math.round(llmResult.score)))
      return {
        url: 'Uploaded Screenshot',
        score: finalScore,
        verdict: getVerdict(finalScore),
        categories: llmResult.categories.length > 0 ? llmResult.categories : [
          { name: 'Visual Design', score: finalScore },
          { name: 'Layout Structure', score: finalScore },
          { name: 'Copywriting', score: finalScore },
          { name: 'Code/Markup Quality', score: 0 },
          { name: 'Originality', score: finalScore }
        ],
        findings: [skippedMarkupFinding, ...llmResult.findings],
        summary: llmResult.summary || 'Screenshot analyzed for visual and copywriting patterns.',
        provider: llmResult.provider,
        screenshotPreview: `data:${mimeType};base64,${imageBase64}`
      }
    }

    // Fallback without API Key
    const fallbackScore = 48
    return {
      url: 'Uploaded Screenshot',
      score: fallbackScore,
      verdict: getVerdict(fallbackScore),
      categories: [
        { name: 'Visual Design', score: 50 },
        { name: 'Layout Structure', score: 45 },
        { name: 'Copywriting', score: 50 },
        { name: 'Code/Markup Quality', score: 0 },
        { name: 'Originality', score: 55 }
      ],
      findings: [
        skippedMarkupFinding,
        {
          pattern: 'Visual Layout Inspected',
          severity: 'medium',
          evidence: 'Visual composition analyzed in offline heuristic mode.',
          roast: 'Add your GEMINI_API_KEY in .env to unlock real-time Gemini AI vision critique.'
        }
      ],
      summary: 'Visual inspection preview mode (AI API key not configured).',
      provider: 'heuristic',
      screenshotPreview: `data:${mimeType};base64,${imageBase64}`
    }
  }

  // --- LINK MODE ---
  const rawUrl = (body?.url || '').trim()
  if (!rawUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Please provide a valid website URL.'
    })
  }

  // Step 1: Validate & SSRF Protection
  let validatedUrl: URL
  try {
    validatedUrl = await validateUrl(rawUrl)
  } catch (err: any) {
    throw createError({
      statusCode: 400,
      statusMessage: err.message || 'Invalid or forbidden URL'
    })
  }

  const normalizedUrlStr = validatedUrl.toString()

  // Check 10-minute cache (bypassed if transitioning from heuristic to AI vision)
  const cached = getCachedResult(normalizedUrlStr, Boolean(geminiKey || anthropicKey))
  if (cached) {
    return cached
  }

  // Step 2: Fetch webpage & screenshot via Playwright
  let pageData: {
    html: string
    visibleText: string
    screenshotBase64: string
    mimeType: string
  }

  try {
    pageData = await fetchWebpage(normalizedUrlStr)
  } catch (err: any) {
    let userMsg = err.message || 'Failed to fetch the target website.'
    const msg = (err.message || '').toLowerCase()
    if (msg.includes('timeout')) {
      userMsg = 'Target website took too long to respond. The server might be slow or offline.'
    } else if (msg.includes('non-html')) {
      userMsg = err.message
    } else if (msg.includes('http status') || msg.includes('http error')) {
      userMsg = err.message
    } else if (msg.includes('err_name_not_resolved') || msg.includes('dns')) {
      userMsg = 'Target domain could not be resolved. Please verify the URL spelling.'
    } else if (msg.includes('bot') || msg.includes('cloudflare') || msg.includes('403')) {
      userMsg = 'Target site is protected by anti-bot verification or rejected the connection.'
    }
    throw createError({
      statusCode: 502,
      statusMessage: userMsg
    })
  }

  // Step 3: Local Heuristics
  const heuristicResult = runHeuristics(pageData.html, pageData.visibleText)
  const heuristicScore = heuristicResult.score

  // Step 4: LLM Analysis with Gemini or Claude
  const prompt = `Target URL: ${normalizedUrlStr}

Here is the deterministic heuristic analysis of the site:
Heuristic score: ${heuristicScore}/100
Heuristic findings:
${JSON.stringify(heuristicResult.findings, null, 2)}

Here is the trimmed rendered HTML (first 50k chars):
\`\`\`html
${pageData.html.slice(0, 50000)}
\`\`\`

Here is a sample of visible page text:
\`\`\`text
${pageData.visibleText.slice(0, 10000)}
\`\`\`

Please analyze the site thoroughly across:
1. Visual Design
2. Layout Structure
3. Copywriting
4. Code/Markup Quality
5. Originality

Score each 0-100 (100 = pure AI slop). If the site shows clear human craft, lower the score. Point only to concrete evidence.
Return strictly valid JSON with this format:
{
  "score": number,
  "categories": [
    { "name": "Visual Design", "score": number },
    { "name": "Layout Structure", "score": number },
    { "name": "Copywriting", "score": number },
    { "name": "Code/Markup Quality", "score": number },
    { "name": "Originality", "score": number }
  ],
  "findings": [
    {
      "pattern": string,
      "severity": "low" | "medium" | "high",
      "evidence": string,
      "roast": string
    }
  ],
  "summary": string
}`

  const llmResult = await callVisionLLM({
    screenshotBase64: pageData.screenshotBase64,
    mimeType: pageData.mimeType,
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    useOllama,
    ollamaBaseUrl,
    ollamaModel,
    geminiKey,
    anthropicKey
  })

  let finalScore = heuristicScore
  let finalCategories = [
    { name: 'Visual Design', score: heuristicScore },
    { name: 'Layout Structure', score: heuristicScore },
    { name: 'Copywriting', score: heuristicScore },
    { name: 'Code/Markup Quality', score: heuristicScore },
    { name: 'Originality', score: heuristicScore }
  ]
  let summary = heuristicScore === 0
    ? 'Clean human craftsmanship detected. Zero AI utility class soup, synthetic gradient blobs, or robotic copywriting patterns found.'
    : heuristicScore <= 35
    ? 'Predominantly handcrafted layout with standard modern web conventions.'
    : 'Inspection completed across rendered HTML markup and copywriting signals.'

  const allFindingsMap = new Map<string, Finding>()
  for (const f of heuristicResult.findings) {
    allFindingsMap.set(f.pattern.toLowerCase(), f)
  }

  let activeProvider: 'gemini' | 'claude' | 'ollama' | 'heuristic' = 'heuristic'

  if (llmResult) {
    activeProvider = llmResult.provider
    // Combine: 0.4 * heuristic + 0.6 * LLM, clamped 0–100.
    finalScore = Math.min(100, Math.max(0, Math.round(0.4 * heuristicScore + 0.6 * llmResult.score)))
    if (llmResult.categories.length > 0) {
      finalCategories = llmResult.categories
    }
    if (llmResult.summary) {
      summary = llmResult.summary
    }
    for (const f of llmResult.findings) {
      allFindingsMap.set(f.pattern.toLowerCase(), f)
    }
  }

  let combinedFindings = Array.from(allFindingsMap.values())
  if (combinedFindings.length === 0) {
    combinedFindings.push({
      pattern: 'Human Craftsmanship Verified',
      severity: 'low',
      evidence: 'Rendered DOM structure, CSS classes, typography, and copywriting show zero robotic boilerplate or synthetic AI design tropes.',
      roast: 'Nothing to roast here: genuine humans wrote this code, flaws and all.'
    })
  }

  const result = {
    url: normalizedUrlStr,
    score: finalScore,
    verdict: getVerdict(finalScore),
    categories: finalCategories,
    findings: combinedFindings,
    summary,
    provider: activeProvider,
    screenshotPreview: pageData.screenshotBase64
      ? `data:${pageData.mimeType};base64,${pageData.screenshotBase64}`
      : undefined
  }

  // Cache URL results for 10 minutes
  setCachedResult(normalizedUrlStr, result)

  return result
})
