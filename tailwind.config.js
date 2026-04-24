/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#228d9f',
          50:  '#eaf6f9',
          100: '#c9e7ec',
          200: '#9fd4dd',
          300: '#6ebfcd',
          400: '#44a9b8',
          500: '#228d9f',
          600: '#1b7281',
          700: '#155867',
          800: '#0f404c',
          900: '#0a2a33'
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f7f8fa',
          border: '#e5e7eb'
        },
        ink: {
          DEFAULT: '#111827',
          muted: '#4b5563',
          soft: '#6b7280'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 1px 3px 0 rgba(17, 24, 39, 0.06)'
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem'
      },
      minHeight: {
        touch: '44px'
      },
      minWidth: {
        touch: '44px'
      }
    }
  },
  plugins: []
};
