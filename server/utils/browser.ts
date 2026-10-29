import { chromium as playwrightCore } from 'playwright-core'
import chromium from '@sparticuz/chromium'

let sharedBrowser: any = null

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser
  }

  const isServerless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL)

  if (isServerless) {
    const executablePath = await chromium.executablePath()
    sharedBrowser = await playwrightCore.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath,
      headless: true
    })
  } else {
    try {
      const { chromium: standardChromium } = await import('playwright')
      sharedBrowser = await standardChromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      })
    } catch {
      const executablePath = await chromium.executablePath()
      sharedBrowser = await playwrightCore.launch({
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        executablePath,
        headless: true
      })
    }
  }

  return sharedBrowser
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000)
}

async function takeQuickScreenshot(targetUrl: string): Promise<string> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SlopScan/1.0'
  })

  try {
    const page = await context.newPage()

    // Abort media, fonts, and trackers that stall page loading
    await page.route('**/*', (route: any) => {
      const req = route.request()
      const type = req.resourceType()
      const url = req.url().toLowerCase()
      if (
        type === 'media' ||
        type === 'font' ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.net') ||
        url.includes('intercom')
      ) {
        return route.abort().catch(() => {})
      }
      return route.continue().catch(() => {})
    })

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 3000
    })

    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false
    })

    return buffer.toString('base64')
  } finally {
    await context.close().catch(() => {})
  }
}

export async function fetchWebpage(targetUrl: string): Promise<{
  html: string
  visibleText: string
  screenshotBase64: string
  mimeType: string
}> {
  let rawHtml = ''

  // 1. Primary: Direct single-page HTTP fetch with browser headers (8s timeout)
  try {
    const httpRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SlopScan/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    })

    if (httpRes.ok) {
      const text = await httpRes.text()
      if (text.length > 100) {
        rawHtml = text
      }
    }
  } catch {
    // Continue to edge proxy fallback
  }

  // 2. Secondary: Fast Edge Reader fallback for distant or Cloudflare-protected servers
  if (!rawHtml) {
    try {
      const edgeRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          'X-Return-Format': 'html',
          'User-Agent': 'SlopScan/1.0'
        },
        signal: AbortSignal.timeout(7000)
      })

      if (edgeRes.ok) {
        const edgeText = await edgeRes.text()
        if (edgeText.length > 100) {
          rawHtml = edgeText
        }
      }
    } catch {
      // Continue to local browser fallback
    }
  }

  // 3. Tertiary: Local Playwright content if direct requests were blocked
  if (!rawHtml) {
    try {
      const browser = await getBrowser()
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SlopScan/1.0'
      })
      try {
        const page = await context.newPage()
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 5000 })
        rawHtml = await page.content()
      } finally {
        await context.close().catch(() => {})
      }
    } catch {
      // Handled below
    }
  }

  if (!rawHtml) {
    throw new Error('Target website could not be reached. The server might be offline or rejecting connections.')
  }

  // Fast background screenshot attempt (capped at 2.5s, never blocks the scan)
  let screenshotBase64 = ''
  try {
    screenshotBase64 = await Promise.race([
      takeQuickScreenshot(targetUrl),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
    ])
  } catch {
    screenshotBase64 = ''
  }

  const trimmedHtml = rawHtml.slice(0, 60000)
  const visibleText = extractTextFromHtml(trimmedHtml)

  return {
    html: trimmedHtml,
    visibleText,
    screenshotBase64,
    mimeType: 'image/jpeg'
  }
}
