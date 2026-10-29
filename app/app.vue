<template>
  <div class="min-h-screen bg-paper text-ink flex flex-col font-sans selection:bg-pink selection:text-white">
    <!-- Top Navigation Bar -->
    <header class="w-full max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 pb-6 flex items-center justify-between z-20">
      <a href="/" class="font-mono text-small font-semibold tracking-tight inline-flex items-center hover:opacity-80 transition-opacity">
        <span>slop</span>
        <span class="text-pink mx-[1px]">/</span>
        <span>scan</span>
      </a>

      <div class="hidden sm:block font-mono text-small text-grey tracking-tight">
        A field instrument for machine-made websites
      </div>
    </header>

    <!-- Main Container -->
    <main class="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col justify-center py-6 sm:py-12">
      <!-- HERO SCAN VIEW (when no result) -->
      <section v-if="!result" class="w-full py-4 sm:py-10">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          <!-- Left Column (~55%) -->
          <div class="lg:col-span-7 flex flex-col items-start">
            <h1 class="text-h1 tracking-tighter leading-[1.02]">
              <span class="block text-ink">Is your website</span>
              <span class="block text-pink">AI slop?</span>
            </h1>

            <p class="text-body text-grey max-w-[420px] mt-8 leading-snug">
              Paste a link or drop a screenshot. We read the markup and the pixels, then tell you what the robots left behind.
            </p>

            <!-- Mode Tabs (Only pill-shaped element) -->
            <div class="mt-10 inline-flex items-center p-1 rounded-full bg-paper-2 border border-edge/30 text-small font-mono">
              <button
                type="button"
                @click="activeTab = 'link'"
                :class="[
                  'px-5 py-1.5 rounded-full transition-all duration-200 text-small',
                  activeTab === 'link'
                    ? 'bg-white dark:bg-[#20201c] text-ink font-medium shadow-sm'
                    : 'text-grey hover:text-ink'
                ]"
              >
                Link
              </button>
              <button
                type="button"
                @click="activeTab = 'screenshot'"
                :class="[
                  'px-5 py-1.5 rounded-full transition-all duration-200 text-small',
                  activeTab === 'screenshot'
                    ? 'bg-white dark:bg-[#20201c] text-ink font-medium shadow-sm'
                    : 'text-grey hover:text-ink'
                ]"
              >
                Screenshot
              </button>
            </div>

            <!-- Input & Action Area -->
            <div class="w-full max-w-[560px] mt-4">
              <!-- LINK TAB -->
              <form v-if="activeTab === 'link'" @submit.prevent="runScan" class="flex flex-col sm:flex-row gap-2 w-full">
                <div class="relative flex-1 flex items-center bg-white dark:bg-[#1a1a17] border border-edge rounded-[8px] h-12 px-3 focus-within:border-ink transition-colors">
                  <span class="font-mono text-small text-faint select-none mr-1">https://</span>
                  <input
                    v-model="urlInput"
                    @input="handleUrlInput"
                    @paste="handleUrlPaste"
                    type="text"
                    inputmode="url"
                    placeholder="yourwebsite.com"
                    aria-label="Website URL to scan"
                    :disabled="isLoading"
                    class="bg-transparent border-none outline-none text-ink font-sans text-base w-full placeholder:text-faint placeholder:font-sans focus:ring-0"
                  />
                </div>

                <button
                  type="submit"
                  :disabled="isLoading || !urlInput.trim()"
                  class="h-12 px-6 rounded-btn bg-pink hover:bg-pink-deep text-paper font-medium text-base transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 flex items-center justify-center min-w-[150px]"
                >
                  <span v-if="!isLoading">Check my slop</span>
                  <span v-else class="font-mono text-small animate-pulse">Scanning...</span>
                </button>
              </form>

              <!-- SCREENSHOT TAB -->
              <div v-else class="w-full flex flex-col gap-3">
                <div
                  @dragover.prevent="isDragging = true"
                  @dragleave.prevent="isDragging = false"
                  @drop.prevent="handleDrop"
                  @click="triggerFileInput"
                  :class="[
                    'border border-dashed rounded-[10px] p-6 text-center cursor-pointer transition-colors bg-paper-2',
                    isDragging ? 'border-pink bg-pink/5' : 'border-edge hover:border-ink'
                  ]"
                >
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="hidden"
                    @change="handleFileSelect"
                  />

                  <div v-if="!screenshotData" class="flex flex-col items-center">
                    <p class="text-body font-medium text-ink">Drop a website screenshot here</p>
                    <p class="text-small text-grey mt-1 font-mono">PNG, JPG, or WEBP up to 5MB</p>
                  </div>

                  <div v-else class="flex items-center justify-between text-left">
                    <div class="flex items-center space-x-3 overflow-hidden">
                      <img :src="screenshotData" alt="Uploaded preview" class="w-12 h-12 object-cover rounded border border-edge" />
                      <div class="overflow-hidden">
                        <p class="text-small font-medium text-ink truncate">{{ screenshotFileName }}</p>
                        <p class="text-xs font-mono text-grey">Ready for visual & copy audit</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      @click.stop="clearScreenshot"
                      class="text-small text-grey hover:text-pink transition-colors font-mono ml-3"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span class="font-mono text-xs text-grey">Markup analysis skipped in screenshot mode.</span>
                  <button
                    type="button"
                    @click="runScan"
                    :disabled="isLoading || !screenshotData"
                    class="w-full sm:w-auto h-12 px-6 rounded-btn bg-pink hover:bg-pink-deep text-paper font-medium text-base transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px]"
                  >
                    <span v-if="!isLoading">Check my slop</span>
                    <span v-else class="font-mono text-small animate-pulse">Scanning...</span>
                  </button>
                </div>
              </div>

              <!-- Quick Try Links & Helper -->
              <div v-if="activeTab === 'link'" class="text-small text-grey mt-3">
                Try it on
                <button
                  type="button"
                  @click="setSampleUrl('stripe.com')"
                  class="text-ink underline hover:text-pink transition-colors cursor-pointer bg-transparent border-none p-0 inline font-normal"
                >stripe.com</button>,
                <button
                  type="button"
                  @click="setSampleUrl('linear.app')"
                  class="text-ink underline hover:text-pink transition-colors cursor-pointer bg-transparent border-none p-0 inline font-normal"
                >linear.app</button>
                or your friend's startup.
              </div>

              <!-- Live Scanner Loading State -->
              <div v-if="isLoading" class="mt-6 p-4 rounded-[10px] bg-paper-2 border border-edge/30" aria-live="polite">
                <div class="flex items-center space-x-3">
                  <div class="w-2.5 h-2.5 bg-pink rounded-full animate-ping"></div>
                  <span class="font-mono text-small text-ink">{{ currentScanStep }}</span>
                </div>
              </div>

              <!-- Friendly Error Alert -->
              <div v-if="errorMessage" class="mt-6 p-4 rounded-[10px] bg-paper-2 border border-pink/60 text-ink" role="alert">
                <p class="font-mono text-small text-pink font-semibold">Inspection Note</p>
                <p class="text-small text-ink mt-1">{{ errorMessage }}</p>
              </div>
            </div>
          </div>

          <!-- Right Column (~45%): ASCII Specimen -->
          <div class="lg:col-span-5 flex flex-col items-center justify-center py-6">
            <AsciiSpecimen :loading="isLoading" :loading-text="currentScanStep" />
            <p class="text-small text-grey max-w-[320px] text-center mt-6 font-mono leading-relaxed">
              <template v-if="isLoading">
                <span class="text-pink font-semibold">Active Scan:</span> Extracting markup, styles & tokens…
              </template>
              <template v-else>
                Specimen 01. The background blob every AI site ships, held for observation.
              </template>
            </p>
          </div>
        </div>
      </section>

      <!-- RESULT SCREEN (after scan) -->
      <section v-else class="w-full py-2 animate-fadeIn">
        <!-- Top Status & Actions Row -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-edge/30 gap-4">
          <div class="overflow-hidden">
            <span class="font-mono text-xs text-grey block uppercase tracking-wider">Report For</span>
            <h2 class="text-body font-mono text-ink truncate max-w-[600px]">{{ result.url }}</h2>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="shareResult"
              class="h-10 px-4 rounded-btn border border-ink text-ink hover:bg-ink hover:text-paper font-mono text-small transition-colors flex items-center justify-center"
            >
              {{ shareCopied ? 'Copied to Clipboard!' : 'Share result' }}
            </button>
            <button
              type="button"
              @click="resetScan"
              class="h-10 px-4 rounded-btn bg-pink hover:bg-pink-deep text-paper font-mono text-small transition-colors flex items-center justify-center"
            >
              Check another
            </button>
          </div>
        </div>

        <!-- Score Dashboard Banner -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-8 border-b border-edge/30">
          <!-- Collapsed ASCII Specimen modulated by Score -->
          <div class="lg:col-span-5 flex flex-col items-center justify-center py-2">
            <AsciiSpecimen :score="result.score" />
            <span class="font-mono text-xs text-grey mt-2">Dither density linked to slop coefficient</span>
          </div>

          <!-- Big Score & Verdict -->
          <div class="lg:col-span-7 flex flex-col justify-center">
            <div class="flex items-baseline space-x-3">
              <span class="text-h1 font-light tracking-tighter text-ink leading-none">
                {{ displayedScore }}%
              </span>
              <span class="font-mono text-small text-grey uppercase tracking-wider">
                AI Slop Index
              </span>
            </div>

            <div class="mt-4 flex items-center space-x-3">
              <span class="text-body font-medium text-pink">
                {{ result.verdict }}
              </span>
              <span class="text-grey font-mono text-small">•</span>
              <span class="text-small text-grey font-mono">
                {{ getVerdictTagline(result.score) }}
              </span>
            </div>

            <p class="text-body text-grey mt-4 leading-relaxed max-w-[620px]">
              {{ result.summary }}
            </p>

            <!-- Category Scores (Thin flat lines, no rounded bars) -->
            <div class="mt-8 space-y-4 max-w-[560px]">
              <div v-for="cat in result.categories" :key="cat.name" class="flex flex-col gap-1">
                <div class="flex justify-between items-center text-small font-mono">
                  <span class="text-ink">{{ cat.name }}</span>
                  <span class="text-grey">{{ cat.score }}%</span>
                </div>
                <div class="w-full h-[2px] bg-edge/20 relative overflow-hidden">
                  <div
                    class="h-full bg-pink transition-all duration-700 ease-out"
                    :style="{ width: `${cat.score}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Findings Breakdown & Screenshot Section -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-10">
          <!-- Findings Column (Left / Main) -->
          <div class="lg:col-span-8 flex flex-col">
            <div class="flex items-center justify-between pb-4 border-b border-edge/30">
              <h3 class="text-body font-semibold text-ink">Detected AI Patterns & Roasts</h3>
              <span class="font-mono text-small text-grey">{{ result.findings.length }} observations</span>
            </div>

            <div class="divide-y divide-edge/30">
              <div
                v-for="(finding, idx) in result.findings"
                :key="idx"
                class="py-6 flex flex-col items-start gap-2"
              >
                <!-- Title & Severity Chip -->
                <div class="w-full flex items-center justify-between gap-3">
                  <h4 class="text-[19px] font-medium text-ink leading-snug">
                    {{ finding.pattern }}
                  </h4>
                  <span
                    :class="[
                      'px-2.5 py-0.5 rounded-full text-xs font-mono uppercase tracking-wider shrink-0',
                      finding.severity === 'high'
                        ? 'bg-pink text-white font-semibold'
                        : finding.severity === 'medium'
                        ? 'border border-ink text-ink font-medium'
                        : 'border border-edge text-grey'
                    ]"
                  >
                    {{ finding.severity }}
                  </span>
                </div>

                <!-- Evidence snippet -->
                <div class="w-full bg-paper-2 rounded-[6px] border border-edge/30 px-3.5 py-2.5 font-mono text-xs sm:text-small text-ink overflow-x-auto whitespace-pre-wrap break-all mt-1">
                  {{ finding.evidence }}
                </div>

                <!-- Witty Roast -->
                <p class="text-grey text-[16px] sm:text-[17px] italic mt-1 leading-snug">
                  “{{ finding.roast }}”
                </p>
              </div>
            </div>
          </div>

          <!-- Screenshot Preview Column (Right) -->
          <div class="lg:col-span-4 flex flex-col">
            <div class="sticky top-8">
              <h3 class="text-body font-semibold text-ink pb-4 border-b border-edge/30">
                Visual Evidence
              </h3>

              <div class="mt-4 border border-edge/40 rounded-[10px] overflow-hidden bg-paper-2">
                <img
                  v-if="result.screenshotPreview"
                  :src="result.screenshotPreview"
                  alt="Captured site snapshot"
                  class="w-full h-auto object-cover max-h-[500px]"
                />
                <div v-else class="p-8 text-center text-grey font-mono text-xs flex flex-col items-center justify-center gap-1.5">
                  <span class="text-ink font-medium">Single-page HTML audit</span>
                  <span class="text-grey">Rendered code & copy scanned in 300ms</span>
                </div>
              </div>

              <!-- Disclaimer Card -->
              <div class="mt-6 p-4 rounded-[10px] bg-paper-2 border border-edge/30 text-grey text-small leading-relaxed">
                <span class="font-mono text-xs uppercase tracking-wider block text-ink mb-1">Disclaimer</span>
                This detects design patterns commonly produced by AI tools. It is not proof that AI was used, and a high score doesn't mean a site is bad.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="w-full max-w-[1200px] mx-auto px-4 sm:px-6 pt-16 pb-12 mt-12 border-t border-edge/20 font-mono text-small text-grey z-10">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          Calibrated against 10,000 hero headers and zero human designers.
        </div>
        <div>
          Nothing is stored. We inspect the crime scene and leave immediately.
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AsciiSpecimen from '~/components/AsciiSpecimen.vue'

interface CategoryScore {
  name: string
  score: number
}

interface FindingItem {
  pattern: string
  severity: 'low' | 'medium' | 'high'
  evidence: string
  roast: string
}

interface ScanResult {
  url: string
  score: number
  verdict: string
  categories: CategoryScore[]
  findings: FindingItem[]
  summary: string
  provider?: 'gemini' | 'claude' | 'ollama' | 'heuristic'
  screenshotPreview?: string
}

const activeTab = ref<'link' | 'screenshot'>('link')
const urlInput = ref('')
const isDragging = ref(false)
const screenshotData = ref<string | null>(null)
const screenshotFileName = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const isLoading = ref(false)
const currentScanStep = ref('Fetching page…')
const errorMessage = ref('')
const result = ref<ScanResult | null>(null)
const displayedScore = ref(0)
const shareCopied = ref(false)

const scanSteps = [
  'Fetching page…',
  'Reading markup…',
  'Inspecting pixels…',
  'Calculating slop…'
]

function cleanProtocol(val: string): string {
  return val.trim().replace(/^https?:\/\//i, '')
}

function handleUrlInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (/^https?:\/\//i.test(target.value.trim())) {
    urlInput.value = cleanProtocol(target.value)
  }
}

function handleUrlPaste(e: ClipboardEvent) {
  const pasted = e.clipboardData?.getData('text')
  if (pasted && /^https?:\/\//i.test(pasted.trim())) {
    e.preventDefault()
    urlInput.value = cleanProtocol(pasted)
  }
}

watch(urlInput, (val) => {
  if (val && /^https?:\/\//i.test(val.trim())) {
    urlInput.value = cleanProtocol(val)
  }
})

function setSampleUrl(url: string) {
  urlInput.value = cleanProtocol(url)
  activeTab.value = 'link'
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processImageFile(file)
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    processImageFile(file)
  }
}

function processImageFile(file: File) {
  if (file.size > 5 * 1024 * 1024) {
    errorMessage.value = 'Image size exceeds maximum limit of 5MB.'
    return
  }

  screenshotFileName.value = file.name
  errorMessage.value = ''

  const reader = new FileReader()
  reader.onload = (ev) => {
    screenshotData.value = ev.target?.result as string
  }
  reader.readAsDataURL(file)
}

function clearScreenshot() {
  screenshotData.value = null
  screenshotFileName.value = ''
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function animateScore(target: number) {
  displayedScore.value = 0
  const duration = 900
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    // Spring-like cubic easing
    const eased = 1 - Math.pow(1 - progress, 3)
    displayedScore.value = Math.round(target * eased)

    if (progress < 1) {
      requestAnimationFrame(step)
    } else {
      displayedScore.value = target
    }
  }

  requestAnimationFrame(step)
}

function getVerdictTagline(score: number): string {
  if (score <= 20) return 'Unadulterated human craftsmanship'
  if (score <= 40) return 'Minor template traces, mostly authentic'
  if (score <= 60) return 'Smells of prompt engineering'
  if (score <= 80) return 'Heavy vibe-coding detected'
  return 'Pure synthetic sludge'
}

async function runScan() {
  errorMessage.value = ''
  isLoading.value = true
  currentScanStep.value = activeTab.value === 'link' ? (scanSteps[0] ?? 'Fetching page…') : 'Inspecting pixels…'

  let stepIdx = 0
  const stepInterval = setInterval(() => {
    stepIdx = (stepIdx + 1) % scanSteps.length
    currentScanStep.value = scanSteps[stepIdx] ?? 'Analyzing…'
  }, 1400)

  try {
    let payload: any = {}

    if (activeTab.value === 'link') {
      const clean = cleanProtocol(urlInput.value)
      const cleanUrl = `https://${clean}`
      payload = { mode: 'link', url: cleanUrl }
    } else {
      payload = { mode: 'screenshot', image: screenshotData.value }
    }

    const data = await $fetch<ScanResult>('/api/scan', {
      method: 'POST',
      body: payload
    })

    result.value = data
    animateScore(data.score)
  } catch (err: any) {
    errorMessage.value = err.data?.statusMessage || err.message || 'Failed to analyze website. Please check the address.'
  } finally {
    clearInterval(stepInterval)
    isLoading.value = false
  }
}

function resetScan() {
  result.value = null
  errorMessage.value = ''
  displayedScore.value = 0
  shareCopied.value = false
  urlInput.value = ''
  clearScreenshot()
}

function shareResult() {
  if (!result.value) return
  const shareText = `SlopScan Report: ${result.value.url} scored ${result.value.score}% (${result.value.verdict}). ${result.value.summary}`

  const nav = typeof navigator !== 'undefined' ? (navigator as any) : null
  if (nav?.clipboard) {
    nav.clipboard.writeText(shareText).then(() => {
      shareCopied.value = true
      setTimeout(() => {
        shareCopied.value = false
      }, 3000)
    })
  }
}
</script>

<style>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 350ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
</style>
