export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg: '#09090b', bg2: '#131316', bg3: '#1c1c1f', bg4: '#252529',
        border: '#27272a',
        accent: '#e11d2e', accent2: '#ff5a63',
        green: '#22c55e', red: '#f43f5e', yellow: '#e8b84b', purple: '#c084fc',
        text: '#f6f0ee', text2: '#a1a1aa', text3: '#71717a',
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
