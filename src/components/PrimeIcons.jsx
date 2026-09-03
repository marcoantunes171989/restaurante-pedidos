// ════════════════════════════════════════════════════════════
//  Ícones internos Pedido Prime — SVG próprios (sem lib externa)
//  Todos usam currentColor: herdam a cor do texto do container.
// ════════════════════════════════════════════════════════════
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const IconDashboard  = () => (<svg {...base} fill="currentColor" stroke="none"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>);
export const IconRelatorios = () => (<svg {...base}><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 14 3-4 3 2 4-6"/></svg>);
export const IconCrm        = () => (<svg {...base}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S13.9 16 14.5 19"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.7c2.4.2 4.2 1.6 4.7 4.3"/></svg>);
export const IconProdutos   = () => (<svg {...base}><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/></svg>);
export const IconCategorias = () => (<svg {...base}><path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8L3 11Z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/></svg>);
export const IconMesas      = () => (<svg {...base}><ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M5 9.5V17M19 9.5V17M12 10v10"/></svg>);
export const IconCozinha    = () => (<svg {...base}><path d="M12 4c-1.1 0-2.1.5-2.7 1.4A3.6 3.6 0 0 0 5.5 9.2c0 .9.3 1.7.8 2.4V18a2 2 0 0 0 2 2h7.4a2 2 0 0 0 2-2v-6.4c.5-.7.8-1.5.8-2.4A3.6 3.6 0 0 0 14.7 5.4C14.1 4.5 13.1 4 12 4Z"/><path d="M8.5 11.5h7"/></svg>);
export const IconPagamento  = () => (<svg {...base}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>);
export const IconQr         = () => (<svg {...base}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zM20 14v2M17 20h3M14 19v1"/></svg>);
export const IconCardapio   = () => (<svg {...base}><path d="M4 4h7v16H6a2 2 0 0 1-2-2V4Z"/><path d="M20 4h-7v16h5a2 2 0 0 0 2-2V4Z"/><path d="M6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2"/></svg>);
export const IconEmpresas   = () => (<svg {...base}><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 9h5a1 1 0 0 1 1 1v11"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1"/></svg>);
export const IconUsuarios   = () => (<svg {...base}><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"/></svg>);
export const IconCargos     = () => (<svg {...base}><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><circle cx="12" cy="12" r="2.2"/><path d="M8 17.5c.5-1.8 2-2.6 4-2.6s3.5.8 4 2.6"/></svg>);
export const IconPermissoes = () => (<svg {...base}><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4.5"/></svg>);
export const IconLink       = () => (<svg {...base}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 1 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 1 0 6.4 6.4l1.2-1.2"/></svg>);
export const IconLicencas   = () => (<svg {...base}><circle cx="8.5" cy="9" r="4.2"/><path d="M11.5 12 20 20.5M16 16.5l2-2M18.5 19l1.8-1.8"/></svg>);
export const IconVersoes    = () => (<svg {...base}><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/></svg>);
export const IconEmpresa    = () => (<svg {...base}><path d="M4 9 5.2 4.5A1 1 0 0 1 6.2 4h11.6a1 1 0 0 1 1 .5L20 9"/><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z"/><path d="M9 20v-5h6v5"/></svg>);
export const IconComanda    = () => (<svg {...base}><path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z"/><path d="M9 8h6M9 12h6"/></svg>);
export const IconBusca      = () => (<svg {...base} width="16" height="16"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>);
export const IconPromocao   = () => (<svg {...base}><path d="M9 5H4a1 1 0 0 0-1 1v5l9 9 7-7-9-9Z"/><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><path d="M14.5 9.5l-5 5"/></svg>);
export const IconConfig     = () => (<svg {...base}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>);

// ── Ícones do PDV (Caixa) — mesma convenção acima (currentColor, base 24) ──
export const IconCheck      = (p) => (<svg {...base} {...p}><path d="M20 6 9 17l-5-5"/></svg>);
export const IconAlerta     = (p) => (<svg {...base} {...p}><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z"/></svg>);
export const IconCarteira   = (p) => (<svg {...base} {...p}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h3"/></svg>);
export const IconRecibo     = (p) => (<svg {...base} {...p}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>);
export const IconImpressora = (p) => (<svg {...base} {...p}><path d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/><circle cx="17.5" cy="12" r="0.6" fill="currentColor" stroke="none"/></svg>);
export const IconDividir    = (p) => (<svg {...base} {...p}><circle cx="7.5" cy="7.5" r="3.2"/><circle cx="16.5" cy="16.5" r="3.2"/><path d="M19 5 5 19"/></svg>);
export const IconDinheiro   = (p) => (<svg {...base} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v0M18 15v0"/></svg>);
export const IconPix        = (p) => (<svg {...base} {...p}><path d="M9.5 4.5 4.5 9.5a2 2 0 0 0 0 2.8l6.7 6.7a2 2 0 0 0 2.8 0l6.7-6.7a2 2 0 0 0 0-2.8L14.5 3a2 2 0 0 0-2 0"/><path d="m8.3 8.3 2.2 2.2a2 2 0 0 0 2.8 0l2.2-2.2M8.3 15.7l2.2-2.2a2 2 0 0 1 2.8 0l2.2 2.2"/></svg>);
export const IconWifiOff    = (p) => (<svg {...base} {...p}><path d="M2 8.5a17 17 0 0 1 5-3M22 8.5a17 17 0 0 0-8.5-4.4M6.3 12a11 11 0 0 1 4-2M17.7 12a11 11 0 0 0-2.7-1.8"/><path d="M9 16a5.5 5.5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="0.6" fill="currentColor" stroke="none"/><path d="M2 2l20 20"/></svg>);
export const IconChevronDown = (p) => (<svg {...base} {...p}><path d="m6 9 6 6 6-6"/></svg>);
export const IconRelogio    = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
export const IconMais       = (p) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>);
export const IconMenos      = (p) => (<svg {...base} {...p}><path d="M5 12h14"/></svg>);
export const IconLixeira    = (p) => (<svg {...base} {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>);
export const IconPessoas    = (p) => (<svg {...base} {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c.6-3.4 3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M16.2 14.7c2.5.3 4.3 1.9 4.8 4.6"/></svg>);
export const IconFechar     = (p) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>);
export const IconSpinner    = () => (<svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>);
