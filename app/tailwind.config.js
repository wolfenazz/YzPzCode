export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'popover-in': {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'popover-in': 'popover-in 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
