/** @type {import('tailwindcss').Config} */
// Identidade Pedido Prime — paleta padrão de 3 cores em todo o sistema:
//  • Azul-marinho (escala `blue`, sobrescrita p/ recolorir o app inteiro)
//  • Branco (textos/superfícies claras)
//  • Dourado (escala `gold`, acentos premium da marca)
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
      },
      colors: {
        blue: {
          50:  "#EDF3FB",
          100: "#D7E4F6",
          200: "#AFC9ED",
          300: "#7FA8DF",
          400: "#3B82F6",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#163A75",
          800: "#102C5B",
          900: "#0B1B33",
          950: "#070B16",
        },
        gold: {
          50:  "#FCF8EC",
          100: "#F8EECD",
          200: "#F2DBA0",
          300: "#F0C76A",
          400: "#D6A84F",
          500: "#C29440",
          600: "#A97923",
          700: "#8A6118",
          800: "#684910",
          900: "#45300A",
        },
      },
    },
  },
  plugins: [],
}
