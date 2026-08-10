/** @type {import('tailwindcss').Config} */
// Identidade Pedido Prime (paleta food service):
//  • Azul-marinho #012E46 / petróleo #012E46 (marca, menus, cabeçalhos)
//  • Laranja food #F38525 (AÇÕES/botões) — escala `gold` (nome mantido p/ compat)
//  • Âmbar premium #F38525 (detalhes/badges) — `premium`
//  • Creme #FFFFFF / gelo #FFFFFF (fundos) · status verde/vermelho/azul
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
          laranja:      "#F38525",
          laranjaHover: "#F38525",
          laranjaAtivo: "#F38525",
          laranjaSoft:  "#FCEFE1",
          petroleo:     "#012E46",
          petroleoSoft: "#E8EDF0",
          verde:        "#5E8C31",
          verdeSoft:    "#EDF3E5",
          offwhite:     "#FFFFFF",
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
          navy:         "#012E46",
          navyActive:   "#012E46",
          ink:          "#012E46",
          inkSoft:      "#64748B",
          inkMuted:     "#94A3B8",
          bgPublic:     "#FFFDFB",
          bgAdmin:      "#F7F8FA",
          surface:      "#FFFFFF",
          border:       "#E5E7EB",
          disabled:     "#F1F5F9",
          gold:         "#F38525",
          success:      "#3F7D5A",
          successSoft:  "#F0FDF4",
          warning:      "#F38525",
          warningSoft:  "#FFF7ED",
          danger:       "#B91C1C",
          dangerSoft:   "#FEF2F2",
          info:         "#012E46",
          infoSoft:     "#EFF6FF",
          neutral:      "#CBD5E1",
          neutralSoft:  "#F1F5F9",
          chart1:       "#012E46",
          chart2:       "#C4322B",
          chart3:       "#3F7D5A",
          chart4:       "#F38525",
          chart5:       "#012E46",
          chart6:       "#94A3B8",
        },
        // Família AZUL PETRÓLEO oficial (#012E46) — institucional/navegação/info.
        // Migrada do azul-marinho legado para a paleta oficial; a rampa preserva
        // a relação claro→escuro (fundos suaves, textos e blocos institucionais).
        blue: {
          50:  "#E8EDF0",  // petróleo suave (fundos) — = --pp-info-soft
          100: "#E8EDF0",
          200: "#012E46",
          300: "#012E46",
          400: "#012E46",
          500: "#012E46",  // azul petróleo oficial (info/dados) — = --pp-info
          600: "#012E46",  // petróleo profundo
          700: "#012E46",
          800: "#012E46",
          900: "#012E46",  // petróleo mais escuro (blocos institucionais)
          950: "#012E46",
        },
        // Escala `gold` = AÇÃO/DESTAQUE. Nome mantido por compatibilidade, mas
        // agora representa o LARANJA PADRÃO oficial da marca (#F38525) — o dourado
        // legado foi migrado para a paleta oficial (laranja=ação · petróleo=
        // institucional). A rampa mantém a relação claro→escuro, então fundos
        // suaves, bordas e textos preservam o contraste, só mudam de matiz.
        gold: {
          50:  "#FCEFE1",  // laranja suave (fundos) — = --client-primary-soft
          100: "#FCEFE1",
          200: "#F5C48A",  // borda de pill ativo — = --client-primary-border
          300: "#F38525",  // hover claro
          400: "#F38525",  // LARANJA PADRÃO principal (ações) — = --pp-primary
          500: "#F38525",  // hover/pressionado — = --pp-primary-hover
          600: "#F38525",  // laranja escuro (texto sobre claro)
          700: "#F38525",
          800: "#7C3F0E",
          900: "#5A2E0A",
        },
        // Paleta das telas internas (painel, operacional). Namespace próprio.
        // Reformulação LIGHT premium (fundo neutro claro, azul + dourado como destaque).
        admin: {
          navy:      "#012E46", // azul petróleo institucional (marca, textos pontuais)
          navy2:     "#012E46", // petróleo mais profundo
          gold:      "#F38525", // laranja padrão (detalhes/ações)
          goldhover: "#F38525", // hover do laranja
          amber:     "#F38525", // detalhe de ação (laranja)
          bg:        "#F7F8FA", // fundo geral das telas
          bg2:       "#F3F4F6", // fundo secundário (superfícies elevadas sutis)
          cream:     "#FFFFFF", // superfície suave
          card:      "#FFFFFF", // cards e áreas internas
          text:      "#182230", // texto principal
          soft:      "#475467", // texto secundário
          muted:     "#667085", // texto auxiliar
          disabled:  "#98A2B3", // texto desabilitado
          border:    "#E5E7EB", // bordas suaves
          divider:   "#ECEFF3", // divisores (linhas de tabela, separadores)
          success:   "#22A06B",
          successbg: "#EAFBF2",
          warn:      "#F38525",
          warnbg:    "#FFF4E5",
          danger:    "#E5484D",
          dangerbg:  "#FFF1F2",
          info:      "#012E46", // azul petróleo (info/dados)
          infobg:    "#E8EDF0", // petróleo suave
          // Sidebar (menu lateral) — versão light premium
          sidebarBg:          "#FFFFFF",
          sidebarBorder:      "#E5E7EB",
          sidebarText:        "#475467",
          sidebarTextActive:  "#182230",
          sidebarActiveBg:    "#FCEFE1",  // laranja suave
          sidebarActiveAccent:"#F38525",  // laranja padrão
          sidebarIcon:        "#667085",
          sidebarIconActive:  "#F38525",  // laranja padrão
        },
        // Paleta dedicada para gráficos (tons médios, sem saturação pesada).
        // Séries oficiais: somente petróleo e laranja (+ cinza neutro).
        chart: {
          blue:   "#012E46",
          gold:   "#F38525",
          green:  "#012E46",
          coral:  "#F38525",
          purple: "#012E46",
          teal:   "#F38525",
          gray:   "#94A3B8",
        },
        // Dashboard Gerencial — alinhado à paleta oficial 2026 (--pp-*): texto
        // em grafite quente, neutros quentes (--pp-border/--pp-bg), ação/
        // informação em azul petróleo #012E46. As séries dos gráficos (donut/
        // status) mantêm hues distintos por necessidade de leitura (data-viz).
        dash: {
          navy: "#2B2320", // texto principal / títulos / valores dos KPIs (grafite quente = --pp-text)
        },
        // ── Paleta oficial 2026 (tokens --pp-*, ver src/index.css e
        // docs/design-tokens.md) — namespace de conveniência para classes
        // simples (bg-pp-primary). Os MESMOS hex vivem em :root como
        // CSS vars; qualquer ajuste deve ser feito nos dois lugares.
        pp: {
          brand: "#F38525",
          brandHover: "#F38525",
          primary: "#F38525",
          primaryHover: "#F38525",
          graphite: "#1A1A1A",
          graphiteDeep: "#101012",
          bg: "#FFFFFF",
          surface: "#FFFFFF",
          border: "#E7E5E4",
          text: "#1A1A1A",
          textBody: "#3F3F46",
          textMuted: "#71717A",
          info: "#012E46",
          warning: "#F38525",
          success: "#16A34A", // status normativo (exceção documentada)
          danger: "#DC2626",  // status normativo (exceção documentada)
        },
      },
      boxShadow: {
        admin: "0 1px 2px rgba(1, 46, 70, 0.05), 0 6px 20px rgba(1, 46, 70, 0.08)",
        premium: "0 8px 24px rgba(16, 24, 40, 0.06)",
        premiumHover: "0 12px 32px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
}
