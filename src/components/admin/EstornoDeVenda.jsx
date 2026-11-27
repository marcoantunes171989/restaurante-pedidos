import { useState } from "react";
import ModalCentral from "../ModalCentral.jsx";
import { AvisoErro, Carregando } from "../graficos/Graficos.jsx";
import { MOTIVO_ESTORNO_MINIMO, buscarPreviaDoEstorno, efeitosDoEstorno, estornarVenda, mensagemDoEstorno, textoDoBloqueio } from "../../lib/relatorios/historicos.js";
import { useConsulta } from "../../pages/admin/relatorios/useConsulta.js";
import { formatCurrency } from "../../pages/pdv/pdvHelpers.js";

/** Estorno de uma venda: mostra o que vai acontecer, pede a justificativa e confirma. Quem decide é o banco. */
export default function EstornoDeVenda({ supabase, vendaId, motivoInicial = "", onFechar, onEstornado }) {
  const { dados: plano, erro, atualizar } = useConsulta(() => buscarPreviaDoEstorno(supabase, vendaId), String(vendaId));
  const [motivo, setMotivo] = useState(motivoInicial.slice(0, 255));
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState("");
  const [feito, setFeito] = useState(false);

  const ausente = plano?.ausente;
  const bloqueios = plano?.bloqueios || [];
  const faltam = MOTIVO_ESTORNO_MINIMO - motivo.trim().length;
  const podeEstornar = !!plano && !ausente && bloqueios.length === 0;

  async function confirmar() {
    if (gravando || faltam > 0) return;
    setGravando(true);
    setFalha("");
    try {
      await estornarVenda(supabase, { vendaId, motivo: motivo.trim() });
      setFeito(true);
      onEstornado?.();
    } catch (e) {
      setFalha(mensagemDoEstorno(e));
      setConfirmando(false);
      atualizar();
    }
    setGravando(false);
  }

  const secundario = "h-11 rounded-xl border border-[#D0D5DD] px-6 text-sm font-semibold text-[#344054] disabled:opacity-40";
  const principal = "h-11 rounded-xl bg-[#012E46] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <ModalCentral ariaLabel="Estornar venda" titulo="Estornar venda" subtitulo={plano?.total != null ? formatCurrency(plano.total) : null} tamanho="md" onFechar={onFechar}
      rodape={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {feito ? <button type="button" className={principal} onClick={onFechar}>Concluir</button> : (
            <>
              <button type="button" className={secundario} disabled={gravando} onClick={confirmando ? () => setConfirmando(false) : onFechar}>{confirmando ? "Revisar" : "Não estornar"}</button>
              {podeEstornar && (confirmando
                ? <button type="button" data-testid="estorno-confirmar" className={principal} disabled={gravando || faltam > 0} onClick={confirmar}>{gravando ? "Estornando…" : "Sim, estornar"}</button>
                : <button type="button" data-testid="estorno-continuar" className={principal} disabled={faltam > 0} onClick={() => setConfirmando(true)}>Estornar venda</button>)}
            </>
          )}
        </div>
      )}>
      {feito ? (
        <p role="status" data-testid="estorno-feito" className="rounded-xl bg-[#E8F5EC] px-3 py-3 text-[13px] font-semibold text-[#1F7A3D]">Venda estornada. O registro original foi mantido no histórico.</p>
      ) : erro ? <AvisoErro mensagem={mensagemDoEstorno(erro)} onTentar={atualizar} /> : !plano ? <Carregando rotulo="Conferindo a venda…" /> : ausente ? (
        <p className="text-[13px] text-[#667085]">O estorno fica disponível depois da atualização do banco de dados.</p>
      ) : (
        <>
          {bloqueios.length > 0 ? (
            <ul className="space-y-2" data-testid="estorno-bloqueios">
              {bloqueios.map((b) => <li key={b.codigo} role="alert" className="rounded-xl bg-[#FEF3E2] px-3 py-3 text-[13px] font-semibold text-[#B45309]">{textoDoBloqueio(b)}</li>)}
            </ul>
          ) : (
            <>
              <dl className="space-y-3" data-testid="estorno-efeitos">
                {efeitosDoEstorno(plano).map((e) => (
                  <div key={e.titulo}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">{e.titulo}</dt>
                    {e.linhas.map((l) => <dd key={l} className="mt-0.5 text-[13px] text-[#1F2933]">{l}</dd>)}
                  </div>
                ))}
              </dl>
              <label className="block text-[13px] font-semibold text-[#344054]">Justificativa do estorno
                <textarea aria-label="Justificativa do estorno" value={motivo} maxLength={255} rows={3} disabled={confirmando}
                  onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu da compra"
                  className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-white p-3 text-[13px] text-[#1F2933] outline-none focus:border-[#012E46] disabled:bg-[#F7F9FA]" />
                {faltam > 0 && <span className="mt-1 block text-xs font-medium text-[#667085]">Faltam {faltam} letra(s).</span>}
              </label>
              {confirmando && <p role="status" className="text-[13px] font-semibold text-[#B45309]">O estorno não pode ser desfeito. Confirmar?</p>}
            </>
          )}
          {falha && <p role="alert" className="text-xs font-semibold text-[#C81E4A]">{falha}</p>}
        </>
      )}
    </ModalCentral>
  );
}
