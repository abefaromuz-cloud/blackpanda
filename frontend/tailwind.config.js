export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        bg: '#0a0708', bg2: '#150f10', bg3: '#1d1416', bg4: '#271a1c',
        border: '#33201f',
        accent: '#e11d2e', accent2: '#ff5a63',
        green: '#22c55e', red: '#f43f5e', yellow: '#e8b84b', purple: '#c084fc',
        text: '#f6f0ee', text2: '#a89a9a', text3: '#6f6162',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(225,29,46,0.18), 0 8px 24px -8px rgba(225,29,46,0.35)',
      }
    }
  },
  plugins: []
};
