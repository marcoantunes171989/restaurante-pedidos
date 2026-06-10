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
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        blue: {
          50:  "#EDF3FB",
          100: "#D7E4F6",
          200: "#AFC9ED",
          300: "#7FA8DF",
          400: "#4E82CB",
          500: "#2B61AE",
          600: "#1E4C92",
          700: "#163A75",
          800: "#102C5B",
          900: "#0C2247",
          950: "#081832",
        },
        gold: {
          50:  "#FCF8EC",
          100: "#F8EECD",
          200: "#F0DC97",
          300: "#E9C75F",
          400: "#E0B135",
          500: "#D4A017",
          600: "#B5860E",
          700: "#92690C",
          800: "#6E4E0A",
          900: "#483306",
        },
      },
    },
  },
  plugins: [],
}
