import { MANUTENCAO_MENSAGEM_PADRAO, MANUTENCAO_TITULO, textoPrevisaoRetorno } from "../lib/sistemaStatus";

// ════════════════════════════════════════════════════════════
//  Tela "Sistema em atualização" (usuário logado, não super admin).
//  Mesmo molde do bloqueio de empresa. O estado do app (carrinho, mesa)
//  fica preservado: quando a manutenção termina, a tela some sozinha e o
//  usuário continua de onde parou.
// ════════════════════════════════════════════════════════════
export default function TelaManutencao({ status, onSair }) {
  const previsao = textoPrevisaoRetorno(status?.previsaoFim);
  return (
    <div data-theme="light" data-manutencao="ativa" className="tema-claro-area flex min-h-screen items-center justify-center bg-[#F7F8FA] px-6 text-[#182230]" style={{ minHeight: "100dvh" }}>
      <div role="status" aria-live="polite" className="w-full max-w-md rounded-[2rem] border border-[#D0E3EC] bg-white p-7 text-center shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F1F5] text-3xl" aria-hidden="true">🛠️</div>
        <h1 className="page-title text-xl font-black text-[#012E46]">{MANUTENCAO_TITULO}</h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#475467]">{status?.mensagem || MANUTENCAO_MENSAGEM_PADRAO}</p>
        {previsao && <p className="mt-3 text-sm font-bold text-[#012E46]">{previsao}</p>}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-[#667085]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#012E46]" aria-hidden="true" />
          Verificando automaticamente…
        </div>
        {onSair && (
          <button onClick={onSair} className="mt-5 w-full rounded-2xl border border-[#E5E7EB] bg-white py-3 text-sm font-black text-[#475467] transition hover:bg-[#F9FAFB]">Sair</button>
        )}
      </div>
    </div>
  );
}

/** Faixa na tela de login: avisa antes de a pessoa tentar entrar. */
export function AvisoManutencaoLogin({ status }) {
  if (!status?.emManutencao) return null;
  const previsao = textoPrevisaoRetorno(status.previsaoFim);
  return (
    <div role="status" aria-live="polite" data-manutencao="aviso-login" className="mb-4 w-full max-w-[390px] rounded-xl border border-[#D0E3EC] bg-[#E8F1F5] p-3 text-sm text-[#012E46]">
      <p className="font-black">🛠️ {MANUTENCAO_TITULO}</p>
      <p className="mt-1 leading-5 text-[#344054]">{status.mensagem || MANUTENCAO_MENSAGEM_PADRAO}</p>
      {previsao && <p className="mt-1 font-bold">{previsao}</p>}
    </div>
  );
}
