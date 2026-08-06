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
        // Tipografia ÚNICA do projeto: Inter em tudo (sans, display e data).
        // Poppins/Manrope/Space Grotesk foram aposentadas na padronização 2026.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        data: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Códigos/comandas/atalhos (font-mono) também em Inter — legibilidade de
        // código via tracking-widest + tabular-nums. Fonte única do projeto.
        mono: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        // ── Paleta OFICIAL (ver .claude/skills/identidade-visual) — namespace
        // `marca`. Fonte única das cores da marca; use estas classes em telas
        // novas e ao migrar telas antigas. Papéis: laranja=ação/CTA ·
        // petroleo=navegação/institucional · verde=confirmação · offwhite=fundo ·
        // cinza=bordas/apoio · grafite=texto/ícones.
        marca: {
          laranja:      "#E67E22",
          laranjaHover: "#D06E1A",
          laranjaAtivo: "#B25E15",
          laranjaSoft:  "#FCEFE1",
          petroleo:     "#0F4C5C",
          petroleoSoft: "#E5EDEF",
          verde:        "#5E8C31",
          verdeSoft:    "#EDF3E5",
          offwhite:     "#F8F6F2",
          branco:       "#FFFFFF",
          cinza:        "#E6E6E6",
          grafite:      "#2D3436",
          grafiteSoft:  "#5F6B6E",
        },
        // ── Novo sistema de marca (rebrand 2026) — namespace `brand`, isolado
        // das escalas legadas (gold/blue/admin) para não afetar telas ainda não
        // migradas. Vermelho-terra = ação/CTA; dourado passa a ser só destaque
        // premium; azul-marinho = navegação/institucional.
        brand: {
          primary:      "#C4322B",
          primaryHover: "#A62B24",
          primarySoft:  "#FEF2F2",
          navy:         "#172033",
          navyActive:   "#263248",
          ink:          "#172033",
          inkSoft:      "#64748B",
          inkMuted:     "#94A3B8",
          bgPublic:     "#FFFDFB",
          bgAdmin:      "#F7F8FA",
          surface:      "#FFFFFF",
          border:       "#E5E7EB",
          disabled:     "#F1F5F9",
          gold:         "#E67E22",
          success:      "#3F7D5A",
          successSoft:  "#F0FDF4",
          warning:      "#C28135",
          warningSoft:  "#FFF7ED",
          danger:       "#B91C1C",
          dangerSoft:   "#FEF2F2",
          info:         "#315A7D",
          infoSoft:     "#EFF6FF",
          neutral:      "#CBD5E1",
          neutralSoft:  "#F1F5F9",
          chart1:       "#315A7D",
          chart2:       "#C4322B",
          chart3:       "#3F7D5A",
          chart4:       "#C28135",
          chart5:       "#7CA1BF",
          chart6:       "#94A3B8",
        },
        // Família AZUL PETRÓLEO oficial (#0F4C5C) — institucional/navegação/info.
        // Migrada do azul-marinho legado para a paleta oficial; a rampa preserva
        // a relação claro→escuro (fundos suaves, textos e blocos institucionais).
        blue: {
          50:  "#E5EDEF",  // petróleo suave (fundos) — = --pp-info-soft
          100: "#CFE0E4",
          200: "#A7C4CB",
          300: "#6FA0AB",
          400: "#2E7A8C",
          500: "#0F4C5C",  // azul petróleo oficial (info/dados) — = --pp-info
          600: "#0C3D4A",  // petróleo profundo
          700: "#0A333E",
          800: "#082A33",
          900: "#061F26",  // petróleo mais escuro (blocos institucionais)
          950: "#04151A",
        },
        // Escala `gold` = AÇÃO/DESTAQUE. Nome mantido por compatibilidade, mas
        // agora representa o LARANJA PADRÃO oficial da marca (#E67E22) — o dourado
        // legado foi migrado para a paleta oficial (laranja=ação · petróleo=
        // institucional). A rampa mantém a relação claro→escuro, então fundos
        // suaves, bordas e textos preservam o contraste, só mudam de matiz.
        gold: {
          50:  "#FCEFE1",  // laranja suave (fundos) — = --client-primary-soft
          100: "#FAE3CC",
          200: "#F0B589",  // borda de pill ativo — = --client-primary-border
          300: "#EC9A5A",  // hover claro
          400: "#E67E22",  // LARANJA PADRÃO principal (ações) — = --pp-primary
          500: "#D06E1A",  // hover/pressionado — = --pp-primary-hover
          600: "#B25E15",  // laranja escuro (texto sobre claro)
          700: "#964E11",
          800: "#7C3F0E",
          900: "#5A2E0A",
        },
        // Paleta das telas internas (painel, operacional). Namespace próprio.
        // Reformulação LIGHT premium (fundo neutro claro, azul + dourado como destaque).
        admin: {
          navy:      "#0F4C5C", // azul petróleo institucional (marca, textos pontuais)
          navy2:     "#0C3D4A", // petróleo mais profundo
          gold:      "#E67E22", // laranja padrão (detalhes/ações)
          goldhover: "#D06E1A", // hover do laranja
          amber:     "#E67E22", // detalhe de ação (laranja)
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
          info:      "#0F4C5C", // azul petróleo (info/dados)
          infobg:    "#E5EDEF", // petróleo suave
          // Sidebar (menu lateral) — versão light premium
          sidebarBg:          "#FFFFFF",
          sidebarBorder:      "#E5E7EB",
          sidebarText:        "#475467",
          sidebarTextActive:  "#182230",
          sidebarActiveBg:    "#FCEFE1",  // laranja suave
          sidebarActiveAccent:"#E67E22",  // laranja padrão
          sidebarIcon:        "#667085",
          sidebarIconActive:  "#E67E22",  // laranja padrão
        },
        // Paleta dedicada para gráficos (tons médios, sem saturação pesada).
        chart: {
          blue:   "#0F4C5C",
          gold:   "#E67E22",
          green:  "#35B779",
          coral:  "#F28C82",
          purple: "#8B7CF6",
          teal:   "#2FBF9A",
          gray:   "#94A3B8",
        },
        // Dashboard Gerencial — alinhado à paleta oficial 2026 (--pp-*): texto
        // em grafite quente, neutros quentes (--pp-border/--pp-bg), ação/
        // informação em azul petróleo #0F4C5C. As séries dos gráficos (donut/
        // status) mantêm hues distintos por necessidade de leitura (data-viz).
        dash: {
          navy: "#2B2320", // texto principal / títulos / valores dos KPIs (grafite quente = --pp-text)
        },
        // ── Paleta oficial 2026 (tokens --pp-*, ver src/index.css e
        // docs/design-tokens.md) — namespace de conveniência para classes
        // simples (bg-pp-primary). Os MESMOS hex vivem em :root como
        // CSS vars; qualquer ajuste deve ser feito nos dois lugares.
        pp: {
          brand: "#E67E22",
          brandHover: "#D06E1A",
          primary: "#E67E22",
          primaryHover: "#D06E1A",
          graphite: "#1A1A1A",
          graphiteDeep: "#101012",
          bg: "#FAF9F5",
          surface: "#FFFFFF",
          border: "#E7E5E4",
          text: "#1A1A1A",
          textBody: "#3F3F46",
          textMuted: "#71717A",
          info: "#2563EB",
          warning: "#F59E0B",
          success: "#16A34A",
          danger: "#DC2626",
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
