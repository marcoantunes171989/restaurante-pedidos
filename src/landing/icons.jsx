// ════════════════════════════════════════════════════════════
//  Ícones lineares próprios da landing — mesmo padrão de traçado do
//  restante do sistema (ver src/components/PrimeIcons.jsx). Sem lib
//  externa de ícones. Um único registro (ICONS) mapeado por chave,
//  usado pelos componentes de seção via <Icone nome="..." />.
// ════════════════════════════════════════════════════════════
const sv = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" };

const IcoCardapio = (p) => (<svg {...sv} {...p}><path d="M7 3v18M17 3v6a3 3 0 0 1-3 3h0a3 3 0 0 1-3-3V3M7 3v6a2 2 0 0 1-2 2H4M17 3a4 4 0 0 1 0 8" /></svg>);
const IcoPdf = (p) => (<svg {...sv} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 14h1a1.5 1.5 0 0 1 0 3H9v-3Zm0 0v4M13.5 14v4M13.5 16h1.2M17 18v-4h2" /></svg>);
const IcoQr = (p) => (<svg {...sv} {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" /></svg>);
const IcoQrExterno = (p) => (<svg {...sv} {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M15 21v-4a2 2 0 0 1 2-2h4" /><path d="m21 15-3 3 3 3" /></svg>);
const IcoTablet = (p) => (<svg {...sv} {...p}><rect x="4" y="2" width="16" height="20" rx="2.4" /><path d="M10 18h4" /></svg>);
const IcoMesa = (p) => (<svg {...sv} {...p}><rect x="3" y="7" width="18" height="4" rx="1" /><path d="M6 11v6M18 11v6" /></svg>);
const IcoChef = (p) => (<svg {...sv} {...p}><path d="M6 13a4 4 0 0 1-1-7.9A4.5 4.5 0 0 1 12 3a4.5 4.5 0 0 1 7 4.1A4 4 0 0 1 18 13" /><path d="M6 13h12v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z" /></svg>);
const IcoCaixa = (p) => (<svg {...sv} {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></svg>);
const IcoDashboard = (p) => (<svg {...sv} {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>);
const IcoRelatorios = (p) => (<svg {...sv} {...p}><path d="M4 20V10M10 20V4M16 20v-7M20 20H4" /></svg>);
const IcoClientes = (p) => (<svg {...sv} {...p}><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="8" r="3.5" /><path d="M22 20v-2a4 4 0 0 0-3-3.8" /><path d="M16 4.2a4 4 0 0 1 0 7.6" /></svg>);
const IcoFidelidade = (p) => (<svg {...sv} {...p}><path d="m12 3 2.6 5.7 6.2.6-4.7 4.1 1.4 6.1L12 16.6 6.5 19.5l1.4-6.1-4.7-4.1 6.2-.6Z" /></svg>);
const IcoSatisfacao = (p) => (<svg {...sv} {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 10h.01M15.5 10h.01" /><path d="M8 15c1.2 1.2 2.6 1.8 4 1.8s2.8-.6 4-1.8" /></svg>);
const IcoPermissoes = (p) => (<svg {...sv} {...p}><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z" /><circle cx="12" cy="10" r="2" /><path d="M9 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4" /></svg>);
const IcoMultiloja = (p) => (<svg {...sv} {...p}><path d="M3 21V9l6-4 6 4v12" /><path d="M15 21v-8l6 3v5Z" /><path d="M7 13h1M7 17h1M11 13h1M11 17h1" /></svg>);
const IcoProdutos = (p) => (<svg {...sv} {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8" /><path d="M12 13v9" /></svg>);
const IcoCheck = (p) => (<svg {...sv} {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4L15.7 9" /></svg>);
const IcoTempo = (p) => (<svg {...sv} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const IcoOrganizacao = (p) => (<svg {...sv} {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></svg>);
const IcoCrescimento = (p) => (<svg {...sv} {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /><path d="M3 21h18" /></svg>);
const IcoRocket = (p) => (<svg {...sv} {...p}><path d="M5 15c-1.2.6-2 2-2 4 2 0 3.4-.8 4-2" /><path d="M9 17c-1.5-.6-3-2.1-3.6-3.6 0-5 3-9 9.6-10.4C16.4 9.6 12.4 12.6 9 17Z" /><path d="M9 13.5 7 12m4.5 4.5L13 15" /></svg>);
const IcoSuporte = (p) => (<svg {...sv} {...p}><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h2.4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Z" /><path d="M20 13h-2.4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-4Z" /><path d="M20 17v1a3 3 0 0 1-3 3h-3" /></svg>);
const IcoSeta = (p) => (<svg {...sv} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
const IcoFechar = (p) => (<svg {...sv} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>);
const IcoMenu = (p) => (<svg {...sv} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
const IcoWhats = (p) => (<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" {...p}><path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.6.7.7-3.5-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C5.5 9.3 10.2 4.7 16 4.7S26.5 9.3 26.5 15 21.8 24.8 16 24.8zm5.7-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 2.6 1.1 3.1.9 3.7.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" /></svg>);

const ICONS = {
  cardapio: IcoCardapio, pdf: IcoPdf, qr: IcoQr, qrExterno: IcoQrExterno, tablet: IcoTablet,
  mesa: IcoMesa, chef: IcoChef, caixa: IcoCaixa, dashboard: IcoDashboard, relatorios: IcoRelatorios,
  clientes: IcoClientes, fidelidade: IcoFidelidade, satisfacao: IcoSatisfacao, permissoes: IcoPermissoes,
  multiloja: IcoMultiloja, produtos: IcoProdutos, canais: IcoQr, check: IcoCheck, tempo: IcoTempo,
  organizacao: IcoOrganizacao, crescimento: IcoCrescimento, rocket: IcoRocket, suporte: IcoSuporte,
};

export function Icone({ nome, className = "h-5 w-5" }) {
  const Comp = ICONS[nome] || IcoCheck;
  return <Comp className={className} />;
}

export { IcoSeta, IcoFechar, IcoMenu, IcoWhats };
