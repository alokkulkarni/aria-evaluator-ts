import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    // share website components
    '../src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        geist: ['var(--font-geist)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
