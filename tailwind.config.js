import type { Config } from "tailwindcss";

export default {
  // Keep dynamic classes used in Sidebar/Nav from being purged
  safelist: [
    // Active/hover states for sidebar buttons
    'bg-blue-600', 'hover:bg-blue-700', 'text-white',
    'text-blue-600', 'border-blue-600',

    // Classes we toggle via JS for layout
    'sidebar-collapsed',
    'content-area',

    // Primary color utilities in case they are toggled dynamically
    'bg-primary', 'text-primary', 'ring-primary', 'border-primary',

    // Aria/data driven states (keep both explicit utilities and variant combos)
    'aria-[current=page]:bg-blue-600',
    'aria-[current=page]:text-white',
    'data-[active=true]:bg-blue-600',
    'data-[active=true]:text-white',
  ],
  darkMode: ["class"],
  // content više nije obavezan u v4, ali ne smeta ako ostane
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // default accent we use for active nav
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ...
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // plugins: [require("tailwindcss-animate")]  <-- uklonjeno, sada koristimo @plugin u CSS-u
} satisfies Config;