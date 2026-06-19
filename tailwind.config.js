/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        field: 'var(--bg-field)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        accent: {
          DEFAULT: 'var(--accent-primary)',
          pink: 'var(--accent-secondary)',
        },
        success: { DEFAULT: 'var(--success)', soft: '#DCFCE7' },
        warning: { DEFAULT: 'var(--warning)', soft: '#FEF3C7' },
        error: { DEFAULT: 'var(--error)', soft: '#FEE2E2' },
        info: { DEFAULT: 'var(--info)', soft: '#DBEAFE' },
      },
      fontFamily: {
        display: ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        card: 'var(--card-shadow)',
        'card-hover': 'var(--card-shadow-hover)',
      },
    },
  },
  plugins: [],
}
