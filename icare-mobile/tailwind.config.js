module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B6B7B',
          dark: '#145a63',
          darker: '#155663',
          deep: '#0F4C5C',
          deepest: '#0A3640',
        },
      },
    },
  },
  plugins: [],
  nativewind: {
    safeArea: true,
  },
};