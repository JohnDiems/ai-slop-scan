import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './app/**/*.{vue,js,ts,jsx,tsx}',
    './components/**/*.{vue,js,ts,jsx,tsx}',
    './layouts/**/*.{vue,js,ts,jsx,tsx}',
    './pages/**/*.{vue,js,ts,jsx,tsx}',
    './composables/**/*.{vue,js,ts,jsx,tsx}',
    './plugins/**/*.{vue,js,ts,jsx,tsx}',
    './app.vue',
    './error.vue'
  ],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        ink: 'var(--ink)',
        grey: 'var(--grey)',
        faint: 'var(--faint)',
        edge: 'var(--edge)',
        pink: 'var(--pink)',
        'pink-deep': 'var(--pink-deep)'
      },
      fontFamily: {
        sans: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      fontSize: {
        h1: ['clamp(44px, 9vw, 92px)', { lineHeight: '1.02', letterSpacing: '-0.035em', fontWeight: '300' }],
        body: ['19px', { lineHeight: '1.45', fontWeight: '400' }],
        small: ['14px', { lineHeight: '1.4' }]
      },
      borderRadius: {
        btn: '10px',
        card: '24px'
      },
      transitionTimingFunction: {
        'spring-ui': 'linear(0, .1176, .3457, .5719, .7511, .8746, .9503, .9911, 1.0095, 1.015, 1.0141, 1.0109, 1.0074, 1.0044, 1.0023, 1.001, 1.0003, 1)',
        editorial: 'cubic-bezier(.23, 1, .32, 1)'
      }
    }
  },
  plugins: []
}

