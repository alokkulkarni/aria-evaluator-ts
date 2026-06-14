import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'
import animate from 'tailwindcss-animate'

const config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      maxWidth: {
        '8xl': '96rem',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'var(--font-inter)', ...defaultTheme.fontFamily.sans],
        display: ['var(--font-space-grotesk)', 'var(--font-inter)', ...defaultTheme.fontFamily.sans],
        body: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(34,211,238,0.45)',
        'glow-blue': '0 0 60px -12px rgba(59,130,246,0.5)',
        'glow-sm': '0 0 24px -6px rgba(34,211,238,0.4)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-rev': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'aurora-1': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(6%, -8%) scale(1.15)' },
        },
        'aurora-2': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1.05)' },
          '50%': { transform: 'translate(-7%, 6%) scale(1.2)' },
        },
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.4s ease-out',
        marquee: 'marquee 32s linear infinite',
        'marquee-rev': 'marquee-rev 32s linear infinite',
        shimmer: 'shimmer 6s linear infinite',
        'aurora-1': 'aurora-1 18s ease-in-out infinite',
        'aurora-2': 'aurora-2 22s ease-in-out infinite',
        'float-y': 'float-y 7s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 4s ease-in-out infinite',
        'spin-slow': 'spin-slow 40s linear infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config

export default config
