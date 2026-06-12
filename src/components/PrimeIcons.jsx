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
