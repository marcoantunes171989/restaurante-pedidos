// ════════════════════════════════════════════════════════════
//  Ícones inline do Cardápio Externo (sem emoji, sem lib externa —
//  mesma convenção de src/App.jsx ProdutoModal: stroke=currentColor).
//  Extraído de CardapioPublico.jsx para evitar import circular com os
//  componentes de tela (ex.: src/pages/cardapio/CardapioBoasVindas.jsx).
// ════════════════════════════════════════════════════════════
const ckIconBase = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
export const CkIconCheck    = (p) => (<svg {...ckIconBase} {...p}><path d="M20 6 9 17l-5-5" /></svg>);
export const CkIconCoracao  = (p) => (<svg {...ckIconBase} fill="currentColor" {...p}><path d="M12 20.5s-7.5-4.6-10-9.3C.4 7.8 2 4.5 5.4 4A5 5 0 0 1 12 7a5 5 0 0 1 6.6-3c3.4.5 5 3.8 3.4 7.2-2.5 4.7-10 9.3-10 9.3Z" /></svg>);
export const CkIconTag      = (p) => (<svg {...ckIconBase} {...p}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-6.2-6.2A2 2 0 0 1 3.8 13V6a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.4Z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></svg>);
export const CkIconEstrela  = (p) => (<svg {...ckIconBase} {...p}><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></svg>);
export const CkIconCalendario = (p) => (<svg {...ckIconBase} {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>);
export const CkIconAlerta   = (p) => (<svg {...ckIconBase} {...p}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" /></svg>);
export const CkIconLixeira  = (p) => (<svg {...ckIconBase} {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-.9 13.2A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.8L5 6" /><path d="M10 11v6M14 11v6" /></svg>);
export const CkIconRelogio  = (p) => (<svg {...ckIconBase} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const CkIconLoja     = (p) => (<svg {...ckIconBase} {...p}><path d="M4 9 5.2 4.5A1 1 0 0 1 6.2 4h11.6a1 1 0 0 1 1 .5L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" /><path d="M9 20v-5h6v5" /></svg>);
export const CkIconMoto     = (p) => (<svg {...ckIconBase} {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M9 18h6l3-6h-4l-2-4H8l-2 3" /><path d="M13 8h4" /></svg>);
export const CkIconGarfo    = (p) => (<svg {...ckIconBase} {...p}><path d="M7 3v7a2 2 0 0 0 4 0V3" /><path d="M9 10v11" /><path d="M16 3c-1.1 0-2 1.3-2 4s.9 4 2 4 2-1.3 2-4-.9-4-2-4Z" /><path d="M16 11v10" /></svg>);
export const CkIconCartao   = (p) => (<svg {...ckIconBase} {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M6 14.5h4" /></svg>);
export const CkIconPix      = (p) => (<svg {...ckIconBase} {...p}><path d="M9.5 4.5 4.5 9.5a2 2 0 0 0 0 2.8l6.7 6.7a2 2 0 0 0 2.8 0l6.7-6.7a2 2 0 0 0 0-2.8L14.5 3a2 2 0 0 0-2 0" /><path d="m8.3 8.3 2.2 2.2a2 2 0 0 0 2.8 0l2.2-2.2M8.3 15.7l2.2-2.2a2 2 0 0 1 2.8 0l2.2 2.2" /></svg>);
export const CkIconDinheiro = (p) => (<svg {...ckIconBase} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v0M18 15v0" /></svg>);
export const CkIconSpinner  = () => (<svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>);
export const CkIconRecibo   = (p) => (<svg {...ckIconBase} {...p}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>);
export const CkIconCarteira = (p) => (<svg {...ckIconBase} {...p}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h3" /></svg>);
export const CkIconChevron  = (p) => (<svg {...ckIconBase} {...p}><path d="m6 9 6 6 6-6" /></svg>);
export const CkIconWifiOff  = (p) => (<svg {...ckIconBase} {...p}><path d="M2 8.5a17 17 0 0 1 5-3M22 8.5a17 17 0 0 0-8.5-4.4M6.3 12a11 11 0 0 1 4-2M17.7 12a11 11 0 0 0-2.7-1.8" /><path d="M9 16a5.5 5.5 0 0 1 6 0" /><circle cx="12" cy="19.5" r="0.6" fill="currentColor" stroke="none" /><path d="M2 2l20 20" /></svg>);
export const CkIconPanela   = (p) => (<svg {...ckIconBase} {...p}><path d="M3 11h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Z" /><path d="M1 11h22" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const CkIconCaixaEntrada = (p) => (<svg {...ckIconBase} {...p}><path d="M3 12h4.5l1.5 3h6l1.5-3H21" /><path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2.5-7Z" /></svg>);
export const CkIconSino     = (p) => (<svg {...ckIconBase} {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>);
export const CkIconSacola   = (p) => (<svg {...ckIconBase} {...p}><path d="M6 8h12l1 12.5a1 1 0 0 1-1 1.5H6a1 1 0 0 1-1-1.5L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
// Carrinho de compras — mesmo traço dos demais Ck* e igual ao ShoppingCart do
// tablet (lucide), para o ícone de CARRINHO ficar idêntico em todas as telas.
export const CkIconCarrinho = (p) => (<svg {...ckIconBase} {...p}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>);
export const CkIconMesa     = (p) => (<svg {...ckIconBase} {...p}><path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>);
export const CkIconAjuda    = (p) => (<svg {...ckIconBase} {...p}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 1.9-2.6 3.6" /><path d="M12 17.2h.01" /></svg>);
export const CkIconLimpeza  = (p) => (<svg {...ckIconBase} {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2" /><circle cx="12" cy="12" r="2.2" /></svg>);
// Mesmo desenho do selo "Personalizável" sobre a imagem do produto — promovido
// a componente para reuso também no aviso "Personalize do seu jeito!".
export const CkIconAjustes  = (p) => (<svg {...ckIconBase} {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" /></svg>);
