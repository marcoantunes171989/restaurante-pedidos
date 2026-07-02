/** @type {import('tailwindcss').Config} */
// Identidade Pedido Prime (paleta food service):
//  • Azul-marinho #0B1F33 / petróleo #123A4A (marca, menus, cabeçalhos)
//  • Laranja food #F97316 (AÇÕES/botões) — escala `gold` (nome mantido p/ compat)
//  • Âmbar premium #F5B041 (detalhes/badges) — `premium`
//  • Creme #FFF7ED / gelo #F8FAFC (fundos) · status verde/vermelho/azul
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      colors: {
        // Família azul-marinho da marca (#0B1F33 principal / #071726 escuro).
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
          900: "#0B1F33",  // azul-marinho principal (novo)
          950: "#071726",  // navy mais escuro (novo)
        },
        // Escala `gold` = COR DE AÇÃO = laranja food (#F97316).
        // Nome mantido por compatibilidade; agora representa o laranja das ações.
        gold: {
          50:  "#FFF7ED",  // creme
          100: "#FFEDD5",
          200: "#FED7AA",
          300: "#FB923C",  // laranja claro (hover/destaque)
          400: "#F97316",  // laranja principal (ações)
          500: "#EA580C",  // laranja pressionado
          600: "#C2410C",  // laranja escuro (texto sobre claro)
          700: "#9A3412",
          800: "#7C2D12",
          900: "#431407",
        },
        // Âmbar dourado premium (detalhes, badges, ícones) — não é ação.
        premium: {
          DEFAULT: "#F5B041",
          light:   "#FBD38D",
          dark:    "#D98E1F",
        },
        // Paleta das telas internas (painel, operacional). Namespace próprio.
        admin: {
          navy:      "#0B1F33", // azul-marinho principal (menu, títulos)
          navy2:     "#123A4A", // azul petróleo (hover menu, cards premium)
          gold:      "#F97316", // AÇÃO (laranja food)
          goldhover: "#FB923C", // laranja claro (hover)
          amber:     "#F5B041", // detalhe premium
          bg:        "#F8FAFC", // fundo geral das telas
          cream:     "#FFF7ED", // fundo acolhedor (comercial/cardápio)
          card:      "#FFFFFF", // cards e áreas internas
          text:      "#1E293B", // texto principal
          soft:      "#64748B", // texto secundário
          border:    "#E5E7EB", // bordas suaves
          success:   "#16A34A",
          successbg: "#DCFCE7",
          warn:      "#F59E0B",
          warnbg:    "#FFF7E6",
          danger:    "#DC2626",
          dangerbg:  "#FEE2E2",
          info:      "#2563EB",
          infobg:    "#EFF6FF",
        },
      },
      boxShadow: {
        admin: "0 1px 2px rgba(11,31,51,0.05), 0 6px 20px rgba(11,31,51,0.08)",
      },
    },
  },
  plugins: [],
}
