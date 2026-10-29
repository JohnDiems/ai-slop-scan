# SlopScan — "Is your website AI slop?"

SlopScan is a field instrument for detecting AI-generated and "vibe-coded" websites. It analyzes rendered markup, visual composition, typography, and copywriting, returning an **AI Slop Score** (0–100%), categorical evaluations, and a breakdown of every machine-made design pattern found—each paired with a short, witty roast.

---

## 1. Features & Architecture

- **Dual Analysis Modes**:
  - **Link**: Full pipeline inspecting rendered DOM, CSS soup, section flow, typography, and high-fidelity viewport screenshots.
  - **Screenshot**: Drag-and-drop image upload (PNG, JPG, WEBP, max 5MB) for visual and copywriting audits without running SSRF/markup checks.
- **Deterministic Heuristics Engine (`server/utils/heuristics.ts`)**:
  - Tailwind utility class soup (15+ classes per element)
  - Radix / Lucide / Shadcn iconography and default styles
  - Absence of custom typography (exclusive Inter / Geist defaults)
  - Gradient text (`bg-clip-text text-transparent`) on headings
  - Synthetic purple→blue and indigo→pink gradient tropes
  - Blurred ambient blobs (`blur-3xl rounded-full`)
  - Identical 3/4-column rounded card grids
  - Emoji icons in feature lists
  - Sparkle pill announcements (`✨ Now in beta`)
  - Faux testimonials, stock avatars, and placeholder personas
  - Missing alt attributes, missing custom favicon, and default metadata
  - High-frequency AI buzzwords ("Revolutionize", "Seamless", "Next-generation", "Supercharge", "Cutting-edge")
  - Formulaic rhetorical tropes (em-dash spam, "It's not just X, it's Y")
- **Ruthless LLM Critique (Ollama, Gemini, or Claude)**:
  - **Ollama (100% Local & Free)**: Run models locally (e.g. `llama3.2-vision`, `llava`, `mistral`) with zero API keys and complete privacy.
  - **Google Gemini & Anthropic Claude**: Cloud vision APIs with multi-tier failover.
  - Blends deterministic signals (40%) with LLM visual and copy critique (60%).
  - Evaluates Visual Design, Layout Structure, Copywriting, Code/Markup Quality, and Originality.
- **Enterprise-Grade SSRF Protection (`server/utils/ssrf.ts`)**:
  - Enforces HTTP/HTTPS only.
  - DNS pre-resolution verifying all resolved A/AAAA addresses are not private, loopback, link-local, carrier-grade NAT, or reserved ranges (RFC 1918, RFC 3927, RFC 6598, RFC 5737, etc.).
- **Live ASCII Specimen (`components/AsciiSpecimen.vue`)**:
  - Procedural dithered sphere rendering layered sine noise at 12fps in pure monospace text.
  - Dynamically modulates density and pink hue distribution based on the site's Slop Index.
  - Respects `prefers-reduced-motion` and scales down on mobile viewports.
- **Zero Storage**: No database. Results are cached in-memory for 10 minutes to respect upstream rate limits.

---

## 2. Tech Stack

- **Framework**: [Nuxt 3](https://nuxt.com/) (TypeScript strict mode)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with flat editorial design tokens
- **Backend**: Nitro server routes (`/api/scan`)
- **Headless Browser**: [Playwright](https://playwright.dev/) (`playwright` + `playwright-core` + `@sparticuz/chromium`)
- **LLM**: [Anthropic Claude API](https://docs.anthropic.com/) (`@anthropic-ai/sdk`)

---

## 3. Local Setup

### Prerequisites
- Node.js >= 20
- pnpm >= 9

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd ai-slop-scan

# Install dependencies
pnpm install

# Install Playwright Chromium browser
pnpm exec playwright install chromium

# Copy environment variables
cp .env.example .env
```

Edit `.env` to configure your Anthropic API key:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```
*(Note: If no Anthropic API key is provided, SlopScan runs in deterministic heuristic inspection mode).*

### Development Server

```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
pnpm build
node .output/server/index.mjs
```

---

## 4. Deployment Guide

### Option A: Docker Deployment (Recommended for full browser support)

A standard multi-stage Docker container runs Playwright headless Chromium reliably:

```dockerfile
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.output ./.output
COPY package.json ./

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

Build and run:
```bash
docker build -t slop-scan .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=your_key slop-scan
```

---

### Option B: Vercel Deployment

SlopScan is configured with `@sparticuz/chromium` and `playwright-core` to run in serverless AWS Lambda / Vercel functions:

1. Import your repository into [Vercel](https://vercel.com/).
2. Under **Project Settings → General**:
   - Framework Preset: **Nuxt.js**
3. Under **Environment Variables**:
   - `ANTHROPIC_API_KEY`: Your Anthropic API key.
4. Under **Settings → Functions**:
   - Allocate at least **1024MB Memory** (1536MB recommended) to allow Chromium execution.
   - Set max duration to **30 seconds** (or 60 seconds if on Pro plan).

---

## 5. Security & Rate Limits

- **SSRF Hardening**: Resolves hostnames prior to connection and blocks private IP ranges (RFC 1918, RFC 3927, link-local, loopback, and carrier-grade NAT).
- **Rate Limit**: Enforces a maximum of 5 scans per IP per hour.
- **Cache**: Caches valid URL scan results for 10 minutes.
- **Payload Limits**: Max 5MB on screenshot uploads; strict 20s timeouts on remote page fetches.

---

## 6. License

MIT
