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
        // ── Novo sistema de marca (rebrand 2026) — namespace `brand`, isolado
        // das escalas legadas (gold/blue/admin) para não afetar telas ainda não
        // migradas. Vermelho-terra = ação/CTA; dourado passa a ser só destaque
        // premium; azul-marinho = navegação/institucional.
        brand: {
          primary:      "#C83F2A",
          primaryHover: "#B43221",
          primarySoft:  "#FFF0EB",
          navy:         "#1F2A44",
          ink:          "#172033",
          inkSoft:      "#667085",
          bgPublic:     "#FFFDFB",
          bgAdmin:      "#F6F7F9",
          surface:      "#FFFFFF",
          border:       "#E4E7EC",
          gold:         "#F4A62A",
          success:      "#2E7D5B",
          warning:      "#D98516",
          danger:       "#C43D3D",
        },
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
        // Escala `gold` = dourado premium (detalhes, ações, badges).
        // Nome mantido por compatibilidade; agora representa o dourado premium claro.
        gold: {
          50:  "#FFF7E0",  // dourado suave (fundos)
          100: "#FAF0D6",
          200: "#F4D27A",  // borda de pill ativo
          300: "#E8C170",  // hover claro
          400: "#D9A441",  // dourado premium principal (ações)
          500: "#C7922F",  // dourado pressionado/hover escuro
          600: "#9A6A00",  // dourado escuro (texto sobre claro)
          700: "#9A3412",
          800: "#7C2D12",
          900: "#431407",
        },
        // Âmbar dourado premium (detalhes, badges, ícones) — não é ação.
        premium: {
          DEFAULT: "#D9A441",
          light:   "#FFF7E0",
          dark:    "#C7922F",
        },
        // Paleta das telas internas (painel, operacional). Namespace próprio.
        // Reformulação LIGHT premium (fundo neutro claro, azul + dourado como destaque).
        admin: {
          navy:      "#061A2E", // legado (marca, textos pontuais) — não usar como bloco de fundo
          navy2:     "#0B2A3D", // legado
          gold:      "#D9A441", // dourado premium (detalhes/ações)
          goldhover: "#C7922F", // hover do dourado
          amber:     "#D9A441", // detalhe premium
          bg:        "#F7F8FA", // fundo geral das telas
          bg2:       "#F3F4F6", // fundo secundário (superfícies elevadas sutis)
          cream:     "#FAFAF8", // superfície suave
          card:      "#FFFFFF", // cards e áreas internas
          text:      "#182230", // texto principal
          soft:      "#475467", // texto secundário
          muted:     "#667085", // texto auxiliar
          disabled:  "#98A2B3", // texto desabilitado
          border:    "#E5E7EB", // bordas suaves
          divider:   "#ECEFF3", // divisores (linhas de tabela, separadores)
          success:   "#22A06B",
          successbg: "#EAFBF2",
          warn:      "#F59E0B",
          warnbg:    "#FFF4E5",
          danger:    "#E5484D",
          dangerbg:  "#FFF1F2",
          info:      "#2563EB",
          infobg:    "#EFF6FF",
          // Sidebar (menu lateral) — versão light premium
          sidebarBg:          "#FFFFFF",
          sidebarBorder:      "#E5E7EB",
          sidebarText:        "#475467",
          sidebarTextActive:  "#182230",
          sidebarActiveBg:    "#FFF7E0",
          sidebarActiveAccent:"#D9A441",
          sidebarIcon:        "#667085",
          sidebarIconActive:  "#D9A441",
        },
        // Paleta dedicada para gráficos (tons médios, sem saturação pesada).
        chart: {
          blue:   "#4F8EF7",
          gold:   "#D9A441",
          green:  "#35B779",
          coral:  "#F28C82",
          purple: "#8B7CF6",
          teal:   "#2FBF9A",
          gray:   "#94A3B8",
        },
      },
      boxShadow: {
        admin: "0 1px 2px rgba(6,26,46,0.05), 0 6px 20px rgba(6,26,46,0.08)",
        premium: "0 8px 24px rgba(16, 24, 40, 0.06)",
        premiumHover: "0 12px 32px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
}
