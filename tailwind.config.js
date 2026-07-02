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
        // Paleta oficial do PAINEL ADMINISTRATIVO (tema claro premium).
        // Namespace próprio para não afetar tablet/cardápio (que seguem escuros).
        admin: {
          navy:      "#14213D", // azul-marinho principal (menu, títulos)
          navy2:     "#1F2A44", // azul escuro secundário (hover menu)
          gold:      "#D99A21", // dourado principal (ações)
          goldhover: "#F2B544", // dourado claro (hover/destaque)
          bg:        "#F8F9FA", // fundo geral das telas
          card:      "#FFFFFF", // cards e áreas internas
          text:      "#2B2D42", // texto principal
          soft:      "#6C757D", // texto secundário
          border:    "#E5E7EB", // bordas suaves
          success:   "#2E7D32",
          successbg: "#E8F5E9",
          warn:      "#F59E0B",
          warnbg:    "#FFF7E6",
          danger:    "#D32F2F",
          dangerbg:  "#FDECEC",
          info:      "#14213D",
          infobg:    "#EDF3FB",
        },
      },
      boxShadow: {
        admin: "0 1px 2px rgba(20,33,61,0.04), 0 4px 16px rgba(20,33,61,0.06)",
      },
    },
  },
  plugins: [],
}
