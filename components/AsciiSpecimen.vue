<template>
  <ClientOnly>
    <div class="ascii-container flex flex-col items-center justify-center overflow-hidden">
      <pre
        aria-hidden="true"
        class="select-none font-mono text-[8px] sm:text-[9px] md:text-[9.5px] leading-[1.0] tracking-[-0.03em] whitespace-pre inline-block text-left"
        v-html="renderedHtml"
      ></pre>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  score?: number | null
  loading?: boolean
  loadingText?: string
}>()

const renderedHtml = ref<string>('')
const RAMP = ' .:-=+*#%@'
const MATRIX_LETTERS = 'SLOPSCAN01AIDOMHEX256RAWNODEHTMLCSSAPI'

let animationFrameId: number | null = null
let lastFrameTime = 0
let animTime = 0

function getDimensions(): { cols: number; rows: number } {
  const isScoreMode = typeof props.score === 'number'
  if (typeof window === 'undefined') {
    return isScoreMode ? { cols: 48, rows: 22 } : { cols: 56, rows: 26 }
  }
  const w = window.innerWidth
  if (isScoreMode) {
    if (w <= 520) return { cols: 36, rows: 18 }
    if (w <= 900) return { cols: 42, rows: 20 }
    return { cols: 48, rows: 22 }
  }
  if (w <= 520) return { cols: 40, rows: 20 }
  if (w <= 900) return { cols: 48, rows: 22 }
  return { cols: 56, rows: 26 }
}

function renderFrame(timestamp: number) {
  const { cols, rows } = getDimensions()

  const isScoreMode = typeof props.score === 'number'
  const scoreVal = isScoreMode ? Math.max(0, Math.min(100, props.score!)) : null
  const scoreFactor = scoreVal !== null ? scoreVal / 100 : 0.5
  const isLoading = Boolean(props.loading && props.loadingText)

  // Increment time for continuous smooth morphing (faster when loading)
  const speed = isLoading
    ? 0.0022
    : (isScoreMode ? 0.0011 + scoreFactor * 0.0016 : 0.0015)
  animTime = timestamp * speed

  const cx = cols / 2
  const cy = rows / 2
  const htmlLines: string[] = []

  // Center banner label calculation during active fetching
  let labelText = ''
  let labelLen = 0
  let labelStart = -1
  let labelEnd = -1

  if (isLoading && props.loadingText) {
    let cleanText = props.loadingText.toUpperCase().trim()
    const maxTextWidth = cols - 6
    if (cleanText.length + 4 > maxTextWidth) {
      cleanText = cleanText.slice(0, maxTextWidth - 5) + '…'
    }
    labelText = `[ ${cleanText} ]`
    labelLen = labelText.length
    labelStart = Math.floor((cols - labelLen) / 2)
    labelEnd = labelStart + labelLen
  }

  const baseRadius = isScoreMode ? 0.56 + scoreFactor * 0.18 : 0.68
  const agitation = isLoading ? 0.14 : (isScoreMode ? 0.06 + scoreFactor * 0.14 : 0.12)

  for (let y = 0; y < rows; y++) {
    const ny = (y - cy) / (rows / 2)
    let currentChunk = { text: '', style: '' }
    let lineStr = ''

    function flushChunk() {
      if (!currentChunk.text) return
      if (currentChunk.style) {
        lineStr += `<span style="${currentChunk.style}">${currentChunk.text}</span>`
      } else {
        lineStr += currentChunk.text
      }
      currentChunk = { text: '', style: '' }
    }

    for (let x = 0; x < cols; x++) {
      // Font aspect ratio correction (~0.52 for monospace characters)
      const nx = ((x - cx) / (rows / 2)) * 0.52
      const r = Math.sqrt(nx * nx + ny * ny)
      const theta = Math.atan2(ny, nx)

      // Multi-harmonic dynamic morphing radius
      const rBlob = baseRadius
        + agitation * Math.sin(2 * theta + animTime * 2.2)
        + (agitation * 0.75) * Math.cos(3 * theta - animTime * 1.6)
        + (agitation * 0.4) * Math.sin(5 * theta + animTime * 2.8)
        + 0.03 * Math.sin(animTime * 3.2)

      const d = r / rBlob
      let char = ' '
      let charStyle = ''

      // Check if inside center loading label
      if (isLoading && y === Math.floor(cy) && x >= labelStart && x < labelEnd) {
        char = labelText[x - labelStart] ?? ' '
        charStyle = 'background: var(--pink); color: var(--paper); font-weight: 700; letter-spacing: 0.04em;'
      } else if (d <= 1.0) {
        // True 3D spherical depth calculation
        const z = Math.sqrt(Math.max(0, 1.0 - d * d))

        // 3D rotation around Y and subtle wobble on X
        const cosT = Math.cos(animTime * 1.35)
        const sinT = Math.sin(animTime * 1.35)
        const rx = nx * cosT - z * sinT
        const rz = nx * sinT + z * cosT
        const ry = ny

        // Volumetric swirling vortices
        const v1 = Math.sin(rx * 3.6 + animTime * 2.4) * Math.cos(ry * 3.4 - animTime * 1.8)
        const v2 = 0.5 * Math.sin(rz * 4.2 + animTime * 3.1)
        const vortex = (v1 + v2) / 1.5 // Range: -1 to 1

        // Lighting model: rim lighting + directional key light
        const rim = Math.pow(1.0 - z, 1.5) * 0.22
        const keyLight = 0.5 * z + 0.35 * (-0.5 * rx - 0.4 * ry + 0.75 * z)
        let density = keyLight + rim + vortex * 0.28

        if (isScoreMode) {
          density = density * (0.6 + scoreFactor * 0.65)
        }

        density = Math.max(0, Math.min(0.999, density))

        // In loading mode, stream animated letters through the dynamic blob!
        if (isLoading && density > 0.4) {
          const letterIdx = Math.abs(Math.floor(x * 3 + y * 7 + animTime * 32)) % MATRIX_LETTERS.length
          char = MATRIX_LETTERS[letterIdx] ?? '@'
        } else {
          const rampIdx = Math.floor(density * RAMP.length)
          char = RAMP[rampIdx] ?? ' '
        }

        // Color coding
        if (isLoading) {
          if (density > 0.6) {
            charStyle = 'color: var(--pink); font-weight: 600;'
          } else if (density > 0.4) {
            charStyle = 'color: var(--pink); opacity: 0.85;'
          } else if (density > 0.24) {
            charStyle = 'color: var(--ink);'
          } else {
            charStyle = 'color: var(--grey); opacity: 0.65;'
          }
        } else {
          if (char === '@' || char === '%') {
            charStyle = 'color: var(--pink); font-weight: 600;'
          } else if (char === '#' || (char === '*' && vortex > 0.15)) {
            charStyle = 'color: var(--pink); opacity: 0.85;'
          } else if (char === '+' || char === '=') {
            charStyle = (isScoreMode && scoreFactor > 0.5)
              ? 'color: var(--pink); opacity: 0.65;'
              : 'color: var(--ink);'
          } else {
            charStyle = 'color: var(--grey); opacity: 0.65;'
          }
        }
      } else if (d <= 1.18) {
        // Outer aura ripples
        const fieldPhase = Math.sin(r * 14.0 - animTime * 4.0)
        if (fieldPhase > 0.5) {
          char = '.'
          charStyle = 'color: var(--faint);'
        } else if (fieldPhase > 0.82) {
          char = ':'
          charStyle = 'color: var(--faint);'
        }
      }

      if (charStyle !== currentChunk.style) {
        flushChunk()
        currentChunk = { text: char, style: charStyle }
      } else {
        currentChunk.text += char
      }
    }

    flushChunk()
    htmlLines.push(lineStr)
  }

  renderedHtml.value = htmlLines.join('\n')
}

function tick(timestamp: number) {
  if (!lastFrameTime) lastFrameTime = timestamp
  const delta = timestamp - lastFrameTime

  // Run at a smooth ~24fps for lively organic fluid animation
  if (delta >= 42) {
    renderFrame(timestamp)
    lastFrameTime = timestamp
  }

  animationFrameId = requestAnimationFrame(tick)
}

function handleResize() {
  if (typeof window === 'undefined') return
  renderFrame(performance.now())
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize)
    renderFrame(performance.now())
    animationFrameId = requestAnimationFrame(tick)
  }
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
})

watch([() => props.score, () => props.loading, () => props.loadingText], () => {
  renderFrame(performance.now())
})
</script>

<style scoped>
.ascii-container {
  user-select: none;
}
</style>
