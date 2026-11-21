// Cartão "Prontidão para PRODUÇÃO": tudo que impede ou arrisca a NFC-e com valor fiscal, numa lista só.
// Só mostra: quem liga a produção é o assistente "Ativar nota fiscal" (passo 9), e o banco confere a trava (migration 186).
export default function ProntidaoProducao({ resultado }) {
  if (!resultado) return null;
  const { itens, bloqueios, avisos, pronto, emProducao } = resultado;
  const faltam = itens.filter((i) => !i.ok);
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="prontidao-prod" data-testid="prontidao-producao">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="prontidao-prod" className="text-[15px] font-bold text-[var(--pp-text)]">Prontidão para PRODUÇÃO (nota com valor fiscal)</h3>
        <span
          data-testid="prontidao-resumo"
          className={`rounded-full px-3 py-1 text-[12px] font-bold ${emProducao ? "bg-[#EAF6EE] text-[#1F7A3D]" : pronto ? "bg-[#EAF6EE] text-[#1F7A3D]" : bloqueios ? "bg-[#FDECEF] text-[#C81E4A]" : "bg-[#FEF3E2] text-[#8A5200]"}`}
        >
          {emProducao ? "Já em produção" : pronto ? "Pronta" : bloqueios ? `${bloqueios} item(ns) bloqueando` : `${avisos} aviso(s)`}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
        Em SP um número de nota queimado não se recupera (a SEFAZ não aceita mais inutilização). Por isso esta lista confere o cadastro ANTES da primeira nota real.
        Os itens marcados como bloqueio são os que o banco exige para ligar a produção.
      </p>
      <ul className="mt-2 divide-y divide-[var(--pp-border)] rounded-xl border border-[var(--pp-border)]">
        {itens.map((i) => (
          <li key={i.id} className="flex gap-2 px-3 py-2" data-testid={`prontidao-${i.id}`} data-ok={i.ok ? "true" : "false"}>
            <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-black text-white ${i.ok ? "bg-[#1F7A3D]" : i.bloqueia ? "bg-[#C81E4A]" : "bg-[#B45309]"}`}>{i.ok ? "✓" : i.bloqueia ? "✕" : "!"}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[var(--pp-text)]">{i.rotulo}{!i.ok && !i.bloqueia ? " (aviso)" : ""}</span>
              {!i.ok && i.dica && <span className="block text-[12px] text-[var(--pp-text-body)]">{i.dica}</span>}
            </span>
          </li>
        ))}
      </ul>
      {faltam.length === 0 && <p className="mt-2 text-[12px] font-semibold text-[#1F7A3D]">Tudo conferido. O passo 9 do assistente liga a produção (digite PRODUÇÃO para confirmar).</p>}
    </section>
  );
}
