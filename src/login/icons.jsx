// ════════════════════════════════════════════════════════════
//  Ícones próprios da tela de login — SVG inline, mesmo traçado do
//  restante do sistema (viewBox 24×24, stroke 2, currentColor). Sem
//  lib externa. Ícones de estado (alerta/check/spinner) reaproveitam
//  src/components/PrimeIcons.jsx em vez de duplicar.
// ════════════════════════════════════════════════════════════
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconMail = (p) => (<svg {...base} className="h-[18px] w-[18px]" {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>);
export const IconLock = (p) => (<svg {...base} className="h-[18px] w-[18px]" {...p}><rect x="4" y="11" width="16" height="9" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
export const IconEyeOpen = (p) => (<svg {...base} className="h-[18px] w-[18px]" {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>);
export const IconEyeClosed = (p) => (<svg {...base} className="h-[18px] w-[18px]" {...p}><path d="m2 2 20 20" /><path d="M6.7 6.7C4 8.5 2 12 2 12s3.5 7 10 7c2.1 0 3.9-.6 5.3-1.6" /><path d="M9.9 4.2A11 11 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.4 3.3" /></svg>);
export const IconShield = (p) => (<svg {...base} className="h-3.5 w-3.5" {...p}><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4.5" /></svg>);
export const IconQr = (p) => (<svg {...base} className="h-4 w-4" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v.01M17.5 21H21v-3.5" /></svg>);

// Preview do produto (composição abstrata) — pedido, mesa, resumo.
export const IconPedido = (p) => (<svg {...base} className="h-4 w-4" {...p}><path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></svg>);
export const IconMesa = (p) => (<svg {...base} className="h-4 w-4" {...p}><ellipse cx="12" cy="7" rx="8" ry="3" /><path d="M5 9.5V17M19 9.5V17M12 10v10" /></svg>);
export const IconRelogio = (p) => (<svg {...base} className="h-4 w-4" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IconCentral = (p) => (<svg {...base} className="h-4 w-4" {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></svg>);
export const IconDados = (p) => (<svg {...base} className="h-4 w-4" {...p}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 3-4 3 2 4-6" /></svg>);
export const IconSeta = (p) => (<svg {...base} className="h-4 w-4" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
