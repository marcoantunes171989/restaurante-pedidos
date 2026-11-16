import { useCallback, useEffect, useState } from "react";
import {
  buscarEmitenteFiscal, resumoCredenciaisFiscais, listarSeriesFiscais, salvarSerieFiscal,
  buscarConfigFiscalVenda, salvarConfigFiscalVenda, enviarCredencialFiscal, arquivoParaBase64, testarConexaoSefaz,
} from "../../../lib/fiscal/fiscalApi";
import { situacaoCertificado, conferirMapaMeios, validarSerieForm, prontidaoEmissao } from "../../../lib/fiscal/emissaoConfig";

// ════════════════════════════════════════════════════════════
//  Aba "Emissão" da Configuração Fiscal (Etapa E4 parte 3).
//  Certificado A1 + senha e CSC vão direto para a API do servidor
//  (/api/fiscal-credencial → cofre). A tela nunca recebe o segredo de volta.
// ════════════════════════════════════════════════════════════

const AMBIENTES = [["homologacao", "Homologação (testes)"], ["producao", "Produção"]];
const MODELOS = [[65, "NFC-e (65)"], [55, "NF-e (55)"]];
const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const rotulo = "mb-1 block text-[12px] font-semibold text-[var(--pp-text-body)]";
const cartao = "rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5";
const TOM = { ok: "text-[#1F7A3D]", vencendo: "text-[#B45309]", vencido: "text-[#C81E4A]", ausente: "text-[var(--pp-text-muted)]" };

function Aviso({ msg }) {
  if (!msg) return null;
  return <p role="status" className={`mt-2 text-[12px] font-semibold ${msg.tipo === "erro" ? "text-[#C81E4A]" : "text-[#1F7A3D]"}`}>{msg.texto}</p>;
}

export default function EmissaoFiscalConfig({ supabase, lojaInfo, formasPagamento = [], emitenteLegado = null }) {
  const lojaId = lojaInfo?.id ?? null;
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [emitente, setEmitente] = useState(null);
  const [credenciais, setCredenciais] = useState([]);
  const [series, setSeries] = useState([]);
  const [config, setConfig] = useState({ mapaMeios: {}, taxaServicoTratamento: null });
  const [msg, setMsg] = useState({});
  const [enviando, setEnviando] = useState("");

  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const [csc, setCsc] = useState({ ambiente: "homologacao", idCsc: "", codigo: "" });
  const [serieForm, setSerieForm] = useState({ modelo: 65, ambiente: "homologacao", serie: "1", proximoNumero: "1" });
  const [mapa, setMapa] = useState({});
  const [taxa, setTaxa] = useState("");

  const formas = formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim());

  // Busca (sem mexer em estado) e aplicação separadas: o efeito só aplica
  // depois que os dados chegam, e só se a tela ainda estiver aberta.
  const buscarTudo = useCallback(async () => {
    try {
      const [e, cr, se, cf] = await Promise.all([
        buscarEmitenteFiscal(supabase, lojaId, { legado: emitenteLegado }),
        resumoCredenciaisFiscais(supabase, lojaId).catch(() => []),
        listarSeriesFiscais(supabase, lojaId),
        buscarConfigFiscalVenda(supabase, lojaId),
      ]);
      return { dados: { e, cr, se, cf } };
    } catch (err) {
      return {
        erro: err?.code === "MIGRACAO_PENDENTE"
          ? "Os recursos de emissão ainda não estão instalados no banco (migrations 175 e 176)."
          : err?.message || "Não foi possível carregar a configuração de emissão.",
      };
    }
  }, [supabase, lojaId, emitenteLegado]);

  const aplicar = useCallback((r) => {
    if (r.erro) setErroCarga(r.erro);
    else {
      const { e, cr, se, cf } = r.dados;
      setErroCarga(""); setEmitente(e); setCredenciais(cr); setSeries(se); setConfig(cf);
      setMapa(cf.mapaMeios || {}); setTaxa(cf.taxaServicoTratamento || "");
    }
    setCarregando(false);
  }, []);

  const carregar = useCallback(async () => aplicar(await buscarTudo()), [aplicar, buscarTudo]);

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    buscarTudo().then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [lojaId, buscarTudo, aplicar]);

  const aviso = (bloco, tipo, texto) => setMsg((m) => ({ ...m, [bloco]: { tipo, texto } }));

  async function enviarCertificado(ev) {
    ev.preventDefault();
    if (!arquivo || !senha) return aviso("cert", "erro", "Escolha o arquivo .pfx e digite a senha.");
    setEnviando("cert");
    try {
      const r = await enviarCredencialFiscal(supabase, { acao: "certificado", lojaId, pfxBase64: await arquivoParaBase64(arquivo), senha });
      setSenha(""); setArquivo(null);
      aviso("cert", "ok", `Certificado de ${r.titular} guardado no cofre. Válido por mais ${r.diasRestantes} dias.`);
      await carregar();
    } catch (err) {
      aviso("cert", "erro", err.message);
    } finally {
      setEnviando("");
    }
  }

  async function testarConexao(modelo) {
    setEnviando(`teste${modelo}`);
    try {
      const r = await testarConexaoSefaz(supabase, { lojaId, modelo, ambiente: "homologacao" });
      aviso("teste", "ok", `SEFAZ ${modelo === 65 ? "NFC-e" : "NF-e"} (homologação): ${r.xMotivo || "em operação"}${r.cStat ? ` (código ${r.cStat})` : ""}.`);
    } catch (err) {
      aviso("teste", "erro", err.message);
    } finally {
      setEnviando("");
    }
  }

  async function enviarCsc(ev) {
    ev.preventDefault();
    setEnviando("csc");
    try {
      await enviarCredencialFiscal(supabase, { acao: "csc", lojaId, ambiente: csc.ambiente, idCsc: csc.idCsc, csc: csc.codigo });
      setCsc((c) => ({ ...c, idCsc: "", codigo: "" }));
      aviso("csc", "ok", "CSC guardado no cofre.");
      await carregar();
    } catch (err) {
      aviso("csc", "erro", err.message);
    } finally {
      setEnviando("");
    }
  }

  async function salvarSerie(ev) {
    ev.preventDefault();
    const erros = validarSerieForm(serieForm);
    if (erros.length) return aviso("serie", "erro", erros.join(" "));
    setEnviando("serie");
    try {
      await salvarSerieFiscal(supabase, lojaId, { modelo: Number(serieForm.modelo), serie: Number(serieForm.serie), ambiente: serieForm.ambiente, proximoNumero: Number(serieForm.proximoNumero) });
      aviso("serie", "ok", "Série salva.");
      await carregar();
    } catch (err) {
      aviso("serie", "erro", err.message);
    } finally {
      setEnviando("");
    }
  }

  async function salvarPagamentos(ev) {
    ev.preventDefault();
    const limpo = Object.fromEntries(Object.entries(mapa).filter(([, v]) => String(v || "").trim() !== "").map(([k, v]) => [k, String(v).trim()]));
    const c = conferirMapaMeios(formas, limpo);
    if (c.invalidos.length) return aviso("pag", "erro", `Use 2 dígitos no código de: ${c.invalidos.join(", ")}.`);
    setEnviando("pag");
    try {
      await salvarConfigFiscalVenda(supabase, lojaId, { mapaMeios: limpo, taxaServicoTratamento: taxa || null });
      aviso("pag", "ok", c.semCodigo.length ? `Salvo. Ainda faltam códigos para: ${c.semCodigo.join(", ")}.` : "Salvo.");
      await carregar();
    } catch (err) {
      aviso("pag", "erro", err.message);
    } finally {
      setEnviando("");
    }
  }

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>;
  if (erroCarga) return <div className={cartao}><p className="text-[13px] font-semibold text-[#C81E4A]">{erroCarga}</p></div>;

  const cert = credenciais.find((c) => c.tipo === "certificado_a1") || null;
  const sc = situacaoCertificado(cert);
  const prontidao = prontidaoEmissao({ emitente, credenciais, series, formas, config });
  const cscDe = (amb) => credenciais.find((c) => c.tipo === "csc" && c.ambiente === amb);

  return (
    <div className="space-y-4" data-testid="emissao-fiscal-config">
      <section className={cartao} aria-labelledby="emissao-prontidao">
        <h3 id="emissao-prontidao" className="text-[15px] font-bold text-[var(--pp-text)]">
          {prontidao.pronto ? "Pronto para emitir em homologação" : "O que falta para emitir em homologação"}
        </h3>
        <ul className="mt-3 space-y-1.5">
          {prontidao.itens.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-[13px]">
              <span aria-hidden="true" className={i.ok ? "text-[#1F7A3D]" : "text-[#B45309]"}>{i.ok ? "✓" : "•"}</span>
              <span className="min-w-0">
                <span className={i.ok ? "text-[var(--pp-text-body)]" : "font-semibold text-[var(--pp-text)]"}>{i.rotulo}</span>
                {!i.ok && i.dica && <span className="block text-[12px] text-[var(--pp-text-muted)]">{i.dica}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]">Produção só é liberada depois dos testes em homologação.</p>
      </section>

      <section className={cartao} aria-labelledby="emissao-cert">
        <h3 id="emissao-cert" className="text-[15px] font-bold text-[var(--pp-text)]">Certificado digital A1</h3>
        <p className={`mt-1 text-[13px] font-semibold ${TOM[sc.estado]}`}>{sc.texto}</p>
        {cert && <p className="text-[12px] text-[var(--pp-text-muted)]">{cert.titular}</p>}
        <form onSubmit={enviarCertificado} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor="emissao-pfx" className={rotulo}>Arquivo do certificado (.pfx)</label>
            <input id="emissao-pfx" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setArquivo(e.target.files?.[0] || null)} className={campo} />
          </div>
          <div className="min-w-0">
            <label htmlFor="emissao-senha" className={rotulo}>Senha do certificado</label>
            <input id="emissao-senha" type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
          </div>
          <button type="submit" disabled={enviando === "cert"} className={botao}>{enviando === "cert" ? "Enviando…" : cert ? "Trocar certificado" : "Enviar certificado"}</button>
        </form>
        <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">O arquivo e a senha vão direto para o cofre do servidor. A tela nunca mostra a senha de volta.</p>
        <Aviso msg={msg.cert} />
        {cert && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--pp-border)] pt-3">
            <span className="text-[13px] font-semibold text-[var(--pp-text-body)]">Testar conexão com a SEFAZ (homologação):</span>
            <button type="button" onClick={() => testarConexao(65)} disabled={!!enviando} className={botao}>{enviando === "teste65" ? "Testando…" : "NFC-e"}</button>
            {emitente?.nfeHabilitada && <button type="button" onClick={() => testarConexao(55)} disabled={!!enviando} className={botao}>{enviando === "teste55" ? "Testando…" : "NF-e"}</button>}
          </div>
        )}
        <Aviso msg={msg.teste} />
      </section>

      <section className={cartao} aria-labelledby="emissao-csc">
        <h3 id="emissao-csc" className="text-[15px] font-bold text-[var(--pp-text)]">CSC da NFC-e (código de segurança da SEFAZ)</h3>
        <ul className="mt-1 text-[13px] text-[var(--pp-text-body)]">
          {AMBIENTES.map(([v, r]) => {
            const c = cscDe(v);
            return <li key={v}>{r}: {c ? <span className="font-semibold text-[#1F7A3D]">cadastrado (id {c.idCsc})</span> : <span className="text-[var(--pp-text-muted)]">não cadastrado</span>}</li>;
          })}
        </ul>
        <form onSubmit={enviarCsc} className="mt-3 grid gap-3 sm:grid-cols-[auto_8rem_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="emissao-csc-amb" className={rotulo}>Ambiente</label>
            <select id="emissao-csc-amb" value={csc.ambiente} onChange={(e) => setCsc((c) => ({ ...c, ambiente: e.target.value }))} className={campo}>
              {AMBIENTES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emissao-csc-id" className={rotulo}>Id do CSC</label>
            <input id="emissao-csc-id" inputMode="numeric" value={csc.idCsc} onChange={(e) => setCsc((c) => ({ ...c, idCsc: e.target.value.replace(/\D/g, "").slice(0, 6) }))} className={campo} />
          </div>
          <div className="min-w-0">
            <label htmlFor="emissao-csc-cod" className={rotulo}>CSC</label>
            <input id="emissao-csc-cod" type="password" autoComplete="off" value={csc.codigo} onChange={(e) => setCsc((c) => ({ ...c, codigo: e.target.value }))} className={campo} />
          </div>
          <button type="submit" disabled={enviando === "csc"} className={botao}>Salvar CSC</button>
        </form>
        <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Gerado no portal da SEFAZ do seu estado. O QR Code versão 3 dispensa o CSC na emissão normal; ele continua útil para a versão 2.</p>
        <Aviso msg={msg.csc} />
      </section>

      <section className={cartao} aria-labelledby="emissao-series">
        <h3 id="emissao-series" className="text-[15px] font-bold text-[var(--pp-text)]">Séries e numeração</h3>
        {series.length === 0
          ? <p className="mt-1 text-[13px] text-[var(--pp-text-muted)]">Nenhuma série cadastrada.</p>
          : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[13px]">
                <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--pp-text-muted)]"><th className="py-1.5">Documento</th><th>Ambiente</th><th>Série</th><th>Próximo nº</th><th>Situação</th></tr></thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--pp-border)] text-[var(--pp-text-body)]">
                      <td className="py-1.5">{s.modelo === 65 ? "NFC-e" : "NF-e"}</td>
                      <td>{s.ambiente === "producao" ? "Produção" : "Homologação"}</td>
                      <td className="tabular-nums">{s.serie}</td>
                      <td className="tabular-nums">{s.proximoNumero}</td>
                      <td>{s.ativa ? "em uso" : "inativa"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <form onSubmit={salvarSerie} className="mt-3 grid gap-3 sm:grid-cols-[auto_auto_6rem_9rem_auto] sm:items-end">
          <div>
            <label htmlFor="emissao-serie-mod" className={rotulo}>Documento</label>
            <select id="emissao-serie-mod" value={serieForm.modelo} onChange={(e) => setSerieForm((f) => ({ ...f, modelo: Number(e.target.value) }))} className={campo}>
              {MODELOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emissao-serie-amb" className={rotulo}>Ambiente</label>
            <select id="emissao-serie-amb" value={serieForm.ambiente} onChange={(e) => setSerieForm((f) => ({ ...f, ambiente: e.target.value }))} className={campo}>
              {AMBIENTES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emissao-serie-num" className={rotulo}>Série</label>
            <input id="emissao-serie-num" inputMode="numeric" value={serieForm.serie} onChange={(e) => setSerieForm((f) => ({ ...f, serie: e.target.value.replace(/\D/g, "").slice(0, 3) }))} className={campo} />
          </div>
          <div>
            <label htmlFor="emissao-serie-prox" className={rotulo}>Próximo número</label>
            <input id="emissao-serie-prox" inputMode="numeric" value={serieForm.proximoNumero} onChange={(e) => setSerieForm((f) => ({ ...f, proximoNumero: e.target.value.replace(/\D/g, "").slice(0, 9) }))} className={campo} />
          </div>
          <button type="submit" disabled={enviando === "serie"} className={botao}>Salvar série</button>
        </form>
        <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Homologação e produção têm numeração separada. O sistema não deixa voltar para um número já usado.</p>
        <Aviso msg={msg.serie} />
      </section>

      <section className={cartao} aria-labelledby="emissao-pag">
        <h3 id="emissao-pag" className="text-[15px] font-bold text-[var(--pp-text)]">Pagamentos e taxa de serviço na nota</h3>
        <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Código de 2 dígitos da tabela oficial de meios de pagamento (Informe Técnico ENCAT). Confirme com o contador.</p>
        <form onSubmit={salvarPagamentos} className="mt-3 space-y-3">
          {formas.length === 0 && <p className="text-[13px] text-[var(--pp-text-muted)]">Nenhuma forma de pagamento ativa.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {formas.map((f) => {
              const chave = `id:${f.id}`;
              const valor = mapa[chave] ?? mapa[f.tipo] ?? "";
              return (
                <div key={chave} className="flex items-end gap-2">
                  <label htmlFor={`emissao-tpag-${f.id}`} className="min-w-0 flex-1 truncate pb-2 text-[13px] font-semibold text-[var(--pp-text-body)]">{f.nome}</label>
                  <input id={`emissao-tpag-${f.id}`} inputMode="numeric" placeholder="00" value={valor}
                    onChange={(e) => setMapa((m) => ({ ...m, [chave]: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    className={`${campo.replace("w-full", "w-20")} shrink-0 text-center tabular-nums`} />
                </div>
              );
            })}
          </div>
          <div className="max-w-md">
            <label htmlFor="emissao-taxa" className={rotulo}>Taxa de serviço (gorjeta)</label>
            <select id="emissao-taxa" value={taxa} onChange={(e) => setTaxa(e.target.value)} className={campo}>
              <option value="">Ainda não definido</option>
              <option value="outras_despesas">Entra na nota como outras despesas</option>
              <option value="fora_da_nota">Fica fora da nota</option>
            </select>
          </div>
          <button type="submit" disabled={enviando === "pag"} className={botao}>Salvar pagamentos</button>
        </form>
        <Aviso msg={msg.pag} />
      </section>
    </div>
  );
}
