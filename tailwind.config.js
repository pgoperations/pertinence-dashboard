/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        heading: ['Lexend', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Pertinence Group brand green sampled from the logo (#56B845).
        // hover = ~15% darker; emphasis = even darker for text headings;
        // soft = light tint for badges, gradients, focus halos.
        accent: {
          DEFAULT: '#56B845',
          hover: '#3F8F32',
          emphasis: '#2F6E25',
          soft: '#E8F5E3',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
};
