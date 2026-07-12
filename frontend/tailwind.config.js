export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)', bg2: 'var(--bg2)', bg3: 'var(--bg3)', bg4: 'var(--bg4)',
        border: 'var(--border)',
        accent: '#e11d2e', accent2: '#ff5a63',
        green: '#22c55e', red: '#f43f5e', yellow: '#e8b84b', purple: '#c084fc',
        text: 'var(--text)', text2: 'var(--text2)', text3: 'var(--text3)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(225,29,46,0.18), 0 8px 24px -8px rgba(225,29,46,0.35)',
      }
    }
  },
  plugins: []
};
