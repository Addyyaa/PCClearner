import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9edff',
          500: '#1976d2',
          600: '#155fb0',
          700: '#124e90'
        },
        surface: {
          light: '#f7f9fc',
          dark: '#101827'
        }
      },
      boxShadow: {
        card: '0 16px 40px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
} satisfies Config
