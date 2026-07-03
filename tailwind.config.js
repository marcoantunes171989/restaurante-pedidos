/** @type {import('tailwindcss').Config} */
// Identidade Pedido Prime (paleta food service):
//  • Azul-marinho #061A2E / petróleo #0B2A3D (marca, menus, cabeçalhos)
//  • Laranja food #C99A2E (AÇÕES/botões) — escala `gold` (nome mantido p/ compat)
//  • Âmbar premium #E7C873 (detalhes/badges) — `premium`
//  • Creme #FFFDF8 / gelo #F8F6F0 (fundos) · status verde/vermelho/azul
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      colors: {
        // Família azul-marinho da marca (#061A2E principal / #03101C escuro).
        blue: {
          50:  "#EDF3FB",
          100: "#D7E4F6",
          200: "#AFC9ED",
          300: "#7FA8DF",
          400: "#3B82F6",
          500: "#2563EB",  // azul informativo
          600: "#1D4ED8",
          700: "#163A75",
          800: "#102C5B",
          900: "#061A2E",  // azul-marinho principal (novo)
          950: "#03101C",  // navy mais escuro (novo)
        },
        // Escala `gold` = COR DE AÇÃO = laranja food (#C99A2E).
        // Nome mantido por compatibilidade; agora representa o laranja das ações.
        gold: {
          50:  "#FFFDF8",  // creme
          100: "#FAF0D6",
          200: "#F0DCA6",
          300: "#E7C873",  // laranja claro (hover/destaque)
          400: "#C99A2E",  // laranja principal (ações)
          500: "#A87A12",  // laranja pressionado
          600: "#8A6A12",  // laranja escuro (texto sobre claro)
          700: "#9A3412",
          800: "#7C2D12",
          900: "#431407",
        },
        // Âmbar dourado premium (detalhes, badges, ícones) — não é ação.
        premium: {
          DEFAULT: "#E7C873",
          light:   "#F0DCA6",
          dark:    "#D98E1F",
        },
        // Paleta das telas internas (painel, operacional). Namespace próprio.
        admin: {
          navy:      "#061A2E", // azul-marinho principal (menu, títulos)
          navy2:     "#0B2A3D", // azul petróleo (hover menu, cards premium)
          gold:      "#C99A2E", // AÇÃO (laranja food)
          goldhover: "#E7C873", // laranja claro (hover)
          amber:     "#E7C873", // detalhe premium
          bg:        "#F8F6F0", // fundo geral das telas
          cream:     "#FFFDF8", // fundo acolhedor (comercial/cardápio)
          card:      "#FFFFFF", // cards e áreas internas
          text:      "#111827", // texto principal
          soft:      "#667085", // texto secundário
          border:    "#E7E1D8", // bordas suaves
          success:   "#16A34A",
          successbg: "#DCFCE7",
          warn:      "#D97706",
          warnbg:    "#FEF3C7",
          danger:    "#DC2626",
          dangerbg:  "#FEE2E2",
          info:      "#2563EB",
          infobg:    "#DBEAFE",
        },
      },
      boxShadow: {
        admin: "0 1px 2px rgba(6,26,46,0.05), 0 6px 20px rgba(6,26,46,0.08)",
      },
    },
  },
  plugins: [],
}
