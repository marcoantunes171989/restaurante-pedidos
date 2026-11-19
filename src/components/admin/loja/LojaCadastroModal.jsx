// ════════════════════════════════════════════════════════════
//  LojaCadastroModal — cadastro/edição UNIFICADO da empresa (5 abas)
//
//  Um único componente para NOVA EMPRESA (mode="create") e EDITAR EMPRESA
//  (mode="edit"). Reúne, para o usuário, dados operacionais + fiscais num só
//  fluxo — a persistência continua dividida por segurança:
//    • operacional → tab_lojas         (via onCriarEmpresa / onSalvarOperacional)
//    • fiscal      → loja_fiscal_emitente (via emitenteApi.salvar)
//
//  Reutiliza a validação da Fase 6.2 (emitenteFiscalService) e as máscaras
//  (lib/masks). NÃO implementa XML/certificado/CSC/SEFAZ. Paleta light oficial.
// ════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import {
  CRT_OPCOES, rotuloCrt, AMBIENTES_NFCE, rotuloAmbienteNfce, UFS, codigoUf,
  SEGMENTOS_LOJA, normalizarDocumentoFiscal, documentoEhAlfanumerico,
  validarDocumentoFiscal, cepValido, codigoMunicipioIbgeValido, serieNfceValida,
  pendenciasEmitenteNfce, percentualCadastroFiscal, podeUsarHomologacao, PRODUCAO_BLOQUEADA,
  limparInscricaoEstadual, inscricaoEstadualValida, emitenteParaFormulario,
} from "../../../lib/emitenteFiscalService";
import { mascaraDocumentoFiscal, mascaraCep, mascaraTelefone, mascaraCnae } from "../../../lib/masks";
import { validarImagemProduto, uploadImagemProduto } from "../../../lib/supabase";
import { normalizarFuncionamento } from "../../../lib/horarioFuncionamentoService";
import LojaHorarioFuncionamento from "./LojaHorarioFuncionamento";
import { consultarCnpj, aplicarDadosCnpj, NAO_VEM_DA_RECEITA } from "../../../lib/cnpjLookup";
import { camposFaltando, metaCampo, usosDoCampo, CAMPOS_CADASTRO } from "../../../lib/fiscal/camposCadastro";

const LBL = "mb-1 block text-[12px] font-semibold text-[#111111]";
const INP = "w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#012E46] placeholder:text-[#9CA3AF]";
const INP_ERR = "border-[#C81E4A] focus:border-[#C81E4A]";
const INP_FALTA = "border-[#F38525] bg-[rgba(243,133,37,0.04)] focus:border-[#F38525]"; // obrigatório para emitir e ainda em branco

// email estrutural simples (não consulta MX)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soDig = (v) => String(v ?? "").replace(/\D/g, "");

// Campo → aba (para navegar ao primeiro erro).
const CAMPO_ABA = {
  nome: "empresa", razaoSocial: "empresa", documento: "empresa", cnaePrincipal: "empresa", inscricaoEstadual: "empresa",
  crt: "fiscal",
  cep: "endereco", logradouro: "endereco", numero: "endereco", bairro: "endereco",
  municipio: "endereco", codigoMunicipioIbge: "endereco", uf: "endereco",
  telefoneFiscal: "endereco", emailFiscal: "endereco",
  nfceSerie: "documentos",
  prefixo: "operacao",
};
const ROTULO_CAMPO = {
  nome: "Nome da empresa", documento: "CNPJ/CPF", inscricaoEstadual: "Inscrição Estadual", cep: "CEP",
  codigoMunicipioIbge: "Código IBGE", emailFiscal: "E-mail fiscal", telefoneFiscal: "Telefone", nfceSerie: "Série da NFC-e", prefixo: "Prefixo da comanda",
};
const ORDEM_ABAS = ["empresa", "fiscal", "endereco", "documentos", "operacao"];

const ABAS = [
  { id: "empresa", rotulo: "Empresa", icone: "🏢" },
  { id: "fiscal", rotulo: "Fiscal", icone: "⚖️" },
  { id: "endereco", rotulo: "Endereço & Contato", icone: "📍" },
  { id: "documentos", rotulo: "NF-e / NFC-e", icone: "🧾" },
  { id: "operacao", rotulo: "Operação", icone: "🛠️" },
];

function estadoInicial(loja) {
  return {
    // operacional (tab_lojas)
    nome: loja?.nome || "",
    prefixo: loja?.prefixo || "",
    documento: normalizarDocumentoFiscal(loja?.documento || ""),
    modoUso: loja?.modoUso || "interno",
    logoUrl: loja?.logoUrl || "",
    // Horário de funcionamento (migration 110) — normalizado com fallback do legado externo.
    funcionamento: normalizarFuncionamento(loja?.funcionamento, loja?.configExterno?.horarios),
    // fiscal (loja_fiscal_emitente) — preenchido no fetch (edit)
    razaoSocial: "", nomeFantasia: "", inscricaoEstadual: "", inscricaoMunicipal: "",
    cnaePrincipal: "", crt: "", segmento: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "",
    codigoMunicipioIbge: "", uf: "",
    telefoneFiscal: "", emailFiscal: "",
    nfceAmbiente: "simulacao", nfceSerie: 1, nfceHabilitada: false, nfeHabilitada: false,
  };
}

function LojaCadastroModal({
  mode = "create",
  loja = null,
  emitenteApi = null,
  onCriarEmpresa = async () => null,
  onSalvarOperacional = async () => {},
  lojasExistentes = [],
  operacaoEditavel = true,
  initialTab = "empresa",
  onFechar = () => {},
  consultaCnpj = consultarCnpj,
}) {
  const ehEdicao = mode === "edit";
  const precisaCarregar = ehEdicao && !!loja?.id && !!emitenteApi?.fetch;
  const [aba, setAba] = useState(ABAS.some((t) => t.id === initialTab) ? initialTab : "empresa");
  const [form, setForm] = useState(() => estadoInicial(loja));
  const [carregando, setCarregando] = useState(precisaCarregar);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [sujo, setSujo] = useState(false);
  const [erroLogo, setErroLogo] = useState("");
  const [uploadando, setUploadando] = useState(false);
  const fileLogoRef = React.useRef(null);
  // Consulta de CNPJ (Receita Federal via BrasilAPI): só o CNPJ sai do navegador.
  const [consultando, setConsultando] = useState(false);
  const [resultadoCnpj, setResultadoCnpj] = useState(null); // { ok, motivo?, preenchidos, diferentes, semDado, avisos, situacao }
  const mapaCnpjRef = React.useRef(null);
  const ultimoCnpjRef = React.useRef("");
  const formRef = React.useRef(form);
  const buscarCnpjRef = React.useRef(null);
  // O App recria o objeto `emitenteApi` a CADA renderização. Guardamos a referência atual em um ref e
  // NÃO a usamos como dependência: senão o cadastro era relido do banco a cada renderização do App,
  // desfazendo o que o usuário digitou e o que a busca pelo CNPJ preencheu.
  const apiRef = React.useRef(emitenteApi);
  const consultaRef = React.useRef(consultaCnpj);
  useEffect(() => { apiRef.current = emitenteApi; consultaRef.current = consultaCnpj; });

  // Carrega o emitente fiscal na edição (a criação começa em branco). O
  // documento vem de tab_lojas (estadoInicial) — o emitente (…e) não o inclui,
  // então o merge preserva o documento.
  useEffect(() => {
    if (!precisaCarregar) return undefined;
    let vivo = true;
    (async () => {
      let e = null;
      try { e = await apiRef.current.fetch(loja.id); } catch { /* migration pendente */ }
      if (!vivo) return;
      const carregado = e ? { ...formRef.current, ...emitenteParaFormulario(e) } : formRef.current;
      formRef.current = carregado;
      setForm(carregado);
      setCarregando(false);
      // CNPJ já cadastrado e ainda falta dado obrigatório: completa os campos em branco com a Receita.
      const d = normalizarDocumentoFiscal(carregado.documento);
      const v = d.length === 14 ? validarDocumentoFiscal(d) : null;
      if (v?.valido && v.tipo === "cnpj" && camposFaltando(carregado, d).obrigatorios.length > 0) buscarCnpjRef.current?.(d, { automatico: true });
    })();
    return () => { vivo = false; };
  }, [precisaCarregar, loja?.id]); // carga única por empresa (ver apiRef)

  const setField = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setSujo(true);
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  };

  const docNorm = normalizarDocumentoFiscal(form.documento);
  const docValidacao = docNorm ? validarDocumentoFiscal(docNorm) : null;
  const docAlfanumerico = documentoEhAlfanumerico(docNorm);

  // Pendências fiscais (não bloqueiam salvar; alimentam a prontidão).
  const pendencias = useMemo(() => pendenciasEmitenteNfce(form, docNorm), [form, docNorm]);
  const pct = useMemo(() => percentualCadastroFiscal(form, docNorm), [form, docNorm]);
  useEffect(() => { formRef.current = form; }, [form]);
  // Obrigatoriedade (NFC-e, NF-e, gerencial): derivada do MESMO validador da emissão.
  const faltando = useMemo(() => camposFaltando(form, docNorm), [form, docNorm]);
  const emissaoLigada = form.nfceHabilitada === true || form.nfeHabilitada === true;
  const faltaObrig = (chave) => faltando.obrigatorios.includes(chave);
  const faltaPorAba = useMemo(() => {
    const m = {};
    for (const k of faltando.obrigatorios) { const a = metaCampo(k)?.aba; if (a) m[a] = (m[a] || 0) + 1; }
    return m;
  }, [faltando]);

  async function buscarCnpj(cnpj, { sobrescrever = false } = {}) {
    const d = normalizarDocumentoFiscal(cnpj);
    setConsultando(true); setResultadoCnpj(null);
    let r;
    try { r = await consultaRef.current(d); } catch { r = { ok: false, motivo: "Não foi possível consultar agora. Preencha manualmente." }; }
    setConsultando(false);
    if (!r?.ok) { setResultadoCnpj({ ok: false, motivo: r?.motivo || "Não foi possível consultar agora." }); return; }
    ultimoCnpjRef.current = d;
    mapaCnpjRef.current = r.dados;
    const ap = aplicarDadosCnpj(formRef.current, r.dados, { sobrescrever });
    formRef.current = ap.form;
    setForm(ap.form);
    if (ap.preenchidos.length) setSujo(true);
    setResultadoCnpj({ ok: true, sobrescreveu: sobrescrever, preenchidos: ap.preenchidos, diferentes: ap.diferentes, semDado: ap.semDado, avisos: r.dados.avisos, situacao: r.dados.situacao });
  }
  useEffect(() => { buscarCnpjRef.current = buscarCnpj; });
  function usarDadosDaReceita() {
    if (!mapaCnpjRef.current) return;
    const ap = aplicarDadosCnpj(formRef.current, mapaCnpjRef.current, { sobrescrever: true });
    formRef.current = ap.form;
    setForm(ap.form); setSujo(true);
    setResultadoCnpj((r) => ({ ...r, preenchidos: [...new Set([...(r?.preenchidos || []), ...ap.preenchidos])], diferentes: [] }));
  }
  // Selos de uso do campo (NFC-e / NF-e / Gerencial) + aviso quando é obrigatório e está em branco.
  const chips = (chave) => {
    const usos = usosDoCampo(chave);
    if (!usos.length) return null;
    const m = metaCampo(chave);
    return (
      <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
        {usos.map((u) => (
          <span key={u} title={m.motivo} className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${u === "Gerencial" ? "bg-[#E5E7EB] text-[#4B5563]" : "bg-[#012E46] text-white"}`}>{u}</span>
        ))}
        {faltaObrig(chave) && <span className="text-[10px] font-bold normal-case text-[#B45309]">• falta preencher</span>}
      </span>
    );
  };
  const homologLiberada = podeUsarHomologacao(form, docNorm);

  // Validação BLOQUEANTE (impede salvar).
  function validar() {
    const e = {};
    if (!form.nome.trim()) e.nome = "Informe o nome da empresa.";
    // O prefixo só é validado quando o campo pode ser editado aqui (nova empresa ou administrador da plataforma).
    // Em Minha Empresa / Dados da Empresa ele é desabilitado: validar um campo que o usuário não consegue
    // corrigir travava o salvar com um erro numa aba que ele nem vê.
    const pfx = (form.prefixo || "").trim().toUpperCase();
    if (operacaoEditavel) {
      if (!/^[A-Z]{2,5}$/.test(pfx)) e.prefixo = "Use de 2 a 5 letras (sem espaços).";
      else if (lojasExistentes.some((l) => l.id !== loja?.id && String(l.prefixo).toUpperCase() === pfx)) e.prefixo = "Já existe outra empresa com este prefixo.";
    }
    // Documento: obrigatório na criação; se preenchido, deve ser válido.
    if (!docNorm) { if (!ehEdicao) e.documento = "Informe o CNPJ ou CPF."; }
    else if (!validarDocumentoFiscal(docNorm).valido) e.documento = validarDocumentoFiscal(docNorm).motivo;
    if (form.inscricaoEstadual && !inscricaoEstadualValida(form.inscricaoEstadual)) e.inscricaoEstadual = "Use de 2 a 14 números, ou ISENTO.";
    if (form.cep && !cepValido(form.cep)) e.cep = "CEP deve ter 8 dígitos.";
    if (form.codigoMunicipioIbge && !codigoMunicipioIbgeValido(form.codigoMunicipioIbge)) e.codigoMunicipioIbge = "Código IBGE deve possuir 7 dígitos.";
    if (form.emailFiscal && !EMAIL_RE.test(form.emailFiscal.trim())) e.emailFiscal = "E-mail inválido.";
    if (form.telefoneFiscal) { const d = soDig(form.telefoneFiscal); if (d.length && (d.length < 10 || d.length > 11)) e.telefoneFiscal = "Telefone deve ter 10 ou 11 dígitos."; }
    if (form.nfceSerie != null && String(form.nfceSerie) !== "" && !serieNfceValida(form.nfceSerie)) e.nfceSerie = "Série deve estar entre 1 e 999.";
    return e;
  }

  function escolherAmbiente(v) {
    if (v === "producao") { setErroGeral("Produção será liberada após homologação fiscal concluída."); return; }
    if (v === "homologacao" && !homologLiberada) { setErroGeral("Não é possível ativar homologação — complete o cadastro fiscal mínimo."); return; }
    setErroGeral(""); setField("nfceAmbiente", v);
  }

  async function importarLogo(ev) {
    const f = ev.target.files?.[0]; if (!f) return;
    setErroLogo("");
    const erroVal = validarImagemProduto(f);
    if (erroVal) { setErroLogo(erroVal); return; }
    setUploadando(true);
    try { setField("logoUrl", ""); const url = await uploadImagemProduto(f, "logos"); setField("logoUrl", url); }
    catch (err) { setErroLogo(err.message || "Falha ao enviar a logo."); }
    setUploadando(false);
  }

  async function salvar() {
    const e = validar();
    if (Object.keys(e).length) {
      setErros(e);
      const primeira = ORDEM_ABAS.find((a) => Object.keys(e).some((c) => CAMPO_ABA[c] === a));
      if (primeira) setAba(primeira);
      // Diz QUAIS campos e em qual aba, para o usuário não ficar procurando.
      const lista = Object.keys(e).filter((c) => e[c]).map((c) => `${ROTULO_CAMPO[c] || c} (aba ${ABAS.find((t) => t.id === CAMPO_ABA[c])?.rotulo || "—"})`);
      setErroGeral("Corrija para salvar: " + lista.join("; ") + ".");
      return;
    }
    setErros({}); setErroGeral(""); setSalvando(true);
    const pfx = form.prefixo.trim().toUpperCase();
    const fiscalPayload = {
      razaoSocial: form.razaoSocial, nomeFantasia: form.nomeFantasia,
      inscricaoEstadual: form.inscricaoEstadual, inscricaoMunicipal: form.inscricaoMunicipal,
      cnaePrincipal: form.cnaePrincipal, crt: form.crt, segmento: form.segmento,
      cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento,
      bairro: form.bairro, municipio: form.municipio, codigoMunicipioIbge: form.codigoMunicipioIbge, uf: form.uf,
      telefoneFiscal: form.telefoneFiscal, emailFiscal: form.emailFiscal,
      nfceAmbiente: form.nfceAmbiente, nfceSerie: form.nfceSerie,
      nfceHabilitada: form.nfceHabilitada, nfeHabilitada: form.nfeHabilitada,
    };
    try {
      let lojaId = loja?.id;
      if (ehEdicao) {
        const okOp = await onSalvarOperacional(lojaId, { nome: form.nome.trim(), prefixo: pfx, documento: docNorm || null, modo_uso: form.modoUso, logo_url: form.logoUrl || null, funcionamento: form.funcionamento });
        if (okOp === false) throw new Error("Os dados da empresa (nome, CNPJ…) não foram salvos. Veja o aviso de erro no topo da tela e tente de novo.");
      } else {
        const nova = await onCriarEmpresa({ nomeLoja: form.nome.trim(), prefixo: pfx, documento: docNorm, modoUso: form.modoUso, logoUrl: form.logoUrl });
        lojaId = nova?.id;
        if (!lojaId) throw new Error("A empresa não pôde ser criada.");
      }
      if (lojaId != null && emitenteApi?.salvar) {
        const ok = await emitenteApi.salvar(lojaId, fiscalPayload);
        if (!ok) throw new Error("O cadastro fiscal não foi salvo. Veja o aviso de erro no topo da tela (permissão, trava de produção ou conexão) e tente de novo.");
      }
      onFechar();
    } catch (err) {
      setErroGeral("Erro ao salvar: " + (err.message || err));
    } finally { setSalvando(false); }
  }

  function fecharComGuarda() {
    if (sujo && !window.confirm("Existem alterações não salvas. Deseja sair?")) return;
    onFechar();
  }

  // contagem de erros por aba (badges)
  const errosPorAba = {};
  for (const c of Object.keys(erros)) { if (erros[c]) { const a = CAMPO_ABA[c]; errosPorAba[a] = (errosPorAba[a] || 0) + 1; } }
  const barra = pct >= 100 ? "#2F9E52" : pct >= 60 ? "#F38525" : "#C81E4A";
  const inpCls = (campo) => `${INP}${erros[campo] ? " " + INP_ERR : emissaoLigada && faltaObrig(campo) ? " " + INP_FALTA : ""}`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white shadow-2xl" style={{ maxWidth: "min(1180px, 92vw)" }}>
        {/* Cabeçalho fixo */}
        <div className="shrink-0 border-b border-[#D1D5DB] px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(1,46,70,0.08)] text-lg text-[#012E46]">🏪</span>
              <div>
                <h2 className="text-[15px] font-bold text-[#111111]">{ehEdicao ? "Editar empresa" : "Nova empresa"}</h2>
                <p className="text-[12px] text-[#6B7280]">Centralize dados operacionais, fiscais e gerenciais do estabelecimento.</p>
              </div>
            </div>
            <button onClick={fecharComGuarda} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-lg border border-[#D1D5DB] bg-white text-lg text-[#6B7280] hover:bg-[#F3F4F6]">✕</button>
          </div>
          {(pct > 0 || ehEdicao) && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>Cadastro fiscal <b style={{ color: barra }}>{pct}%</b> concluído{sujo && <span className="ml-2 text-[#F38525]">• alterações não salvas</span>}</span>
                <span>{pendencias.length} pendência(s)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barra }} /></div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4B5563]" data-testid="legenda-obrigatorios">
                <span className="inline-flex items-center gap-1"><span className="rounded bg-[#012E46] px-1.5 py-px text-[9px] font-bold uppercase text-white">NFC-e</span><span className="rounded bg-[#012E46] px-1.5 py-px text-[9px] font-bold uppercase text-white">NF-e</span> obrigatório para emitir</span>
                <span className="inline-flex items-center gap-1"><span className="rounded bg-[#E5E7EB] px-1.5 py-px text-[9px] font-bold uppercase text-[#4B5563]">Gerencial</span> usado em relatórios e análises</span>
                <span className="font-semibold text-[#B45309]">
                  {faltando.obrigatorios.length === 0 ? "✓ Nada obrigatório falta" : `Faltam ${faltando.nfce.length} para a NFC-e e ${faltando.nfe.length} para a NF-e`}
                  {faltando.gerencial.length > 0 && ` · ${faltando.gerencial.length} recomendado(s) para a análise gerencial`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Barra de abas fixa */}
        <div role="tablist" aria-label="Seções do cadastro" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#D1D5DB] px-3">
          {ABAS.map((t) => {
            const ativo = aba === t.id;
            const nErro = errosPorAba[t.id] || 0;
            return (
              <button key={t.id} role="tab" aria-selected={ativo} id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} onClick={() => setAba(t.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition ${ativo ? "border-[#012E46] text-[#012E46]" : "border-transparent text-[#6B7280] hover:text-[#111111]"}`}>
                <span aria-hidden>{t.icone}</span>{t.rotulo}
                {nErro > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#C81E4A] px-1 text-[10px] font-bold text-white">{nErro}</span>}
                {nErro === 0 && (faltaPorAba[t.id] || 0) > 0 && <span title="Campos obrigatórios para emitir nota que ainda faltam nesta aba" className="grid h-4 min-w-4 place-items-center rounded-full bg-[#F38525] px-1 text-[10px] font-bold text-white">{faltaPorAba[t.id]}</span>}
              </button>
            );
          })}
        </div>

        {/* Conteúdo rolável */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {carregando ? (
            <p className="py-16 text-center text-sm text-[#6B7280]">Carregando cadastro…</p>
          ) : (
            <>
              {/* ══ EMPRESA ══ */}
              {aba === "empresa" && (
                <div role="tabpanel" id="panel-empresa" aria-labelledby="tab-empresa" className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="lc-nome" className={LBL}>Nome da empresa no Pedido Prime *{chips("nome")}</label><input id="lc-nome" value={form.nome} onChange={(e) => setField("nome", e.target.value)} aria-invalid={!!erros.nome} className={inpCls("nome")} placeholder="Ex.: Pizzaria Bella" />{erros.nome && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.nome}</p>}</div>
                  <div><label htmlFor="lc-razao" className={LBL}>Razão Social{chips("razaoSocial")}</label><input id="lc-razao" value={form.razaoSocial} onChange={(e) => setField("razaoSocial", e.target.value)} className={inpCls("razaoSocial")} placeholder="Razão social do emitente" /></div>
                  <div><label htmlFor="lc-fantasia" className={LBL}>Nome Fantasia{chips("nomeFantasia")}</label><input id="lc-fantasia" value={form.nomeFantasia} onChange={(e) => setField("nomeFantasia", e.target.value)} className={INP} placeholder={form.nome} /></div>
                  <div>
                    <label htmlFor="lc-doc" className={LBL}>CNPJ ou CPF *{chips("documento")}</label>
                    <input id="lc-doc" value={mascaraDocumentoFiscal(form.documento)} onChange={(e) => {
                      const d = normalizarDocumentoFiscal(e.target.value).slice(0, 14);
                      setField("documento", d);
                      const v = d.length === 14 ? validarDocumentoFiscal(d) : null;
                      if (v?.valido && v.tipo === "cnpj" && d !== ultimoCnpjRef.current) buscarCnpj(d); // só quando o usuário digita (não ao abrir)
                    }} aria-invalid={!!erros.documento} className={`${inpCls("documento")} font-mono`} placeholder="00.000.000/0000-00 ou 000.000.000-00" />
                    {erros.documento ? <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">✕ {erros.documento}</p>
                      : docValidacao ? <p className={`mt-1 text-[11px] font-semibold ${docValidacao.valido ? "text-[#2F9E52]" : "text-[#C81E4A]"}`}>{docValidacao.valido ? "✓ " : "✕ "}{docValidacao.motivo}</p> : null}
                    {docAlfanumerico && <p className="mt-1 text-[11px] text-[#6B7280]">Documento alfanumérico — letras preservadas.</p>}
                  </div>
                  <div className="sm:col-span-2" data-testid="painel-cnpj">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={consultando || !(docValidacao?.valido && docValidacao.tipo === "cnpj")} onClick={() => buscarCnpj(docNorm, { sobrescrever: true })}
                        className="rounded-xl border border-[#012E46] bg-white px-3 py-2 text-[12px] font-bold text-[#012E46] transition hover:bg-[#F3F7F9] disabled:cursor-not-allowed disabled:opacity-50">
                        {consultando ? "Buscando na Receita…" : "🔎 Buscar dados pelo CNPJ"}
                      </button>
                      <span className="text-[11px] text-[#6B7280]">Digitar o CNPJ preenche os campos em branco; o botão atualiza TODOS os campos com os dados públicos da Receita Federal (menos Inscrição Estadual, Inscrição Municipal e o nome no sistema). Só o CNPJ é enviado ao serviço de consulta (BrasilAPI).</span>
                    </div>
                    {resultadoCnpj && !resultadoCnpj.ok && <p role="alert" className="mt-2 rounded-xl border border-[rgba(200,30,74,0.25)] bg-[rgba(200,30,74,0.06)] px-3 py-2 text-[12px] font-semibold text-[#C81E4A]">{resultadoCnpj.motivo}</p>}
                    {resultadoCnpj?.ok && (
                      <div role="status" className="mt-2 space-y-1.5 rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-2.5 text-[12px] text-[#111111]">
                        <p className="font-bold text-[#012E46]">{resultadoCnpj.preenchidos.length ? `${resultadoCnpj.sobrescreveu ? "Atualizei" : "Preenchi"} ${resultadoCnpj.preenchidos.length} campo(s) com os dados da Receita.` : "Nenhum campo precisou ser preenchido: o cadastro já está igual à Receita."}</p>
                        {resultadoCnpj.semDado.length > 0 && (
                          <p className="text-[#4B5563]">Em branco (a Receita não informa ou não foi possível identificar): <b>{resultadoCnpj.semDado.map((k) => CAMPOS_CADASTRO.find((c) => c.chave === k)?.rotulo || NAO_VEM_DA_RECEITA.find((f) => f.chave === k)?.rotulo || k).join(", ")}</b>.
                            {" "}{NAO_VEM_DA_RECEITA.filter((f) => resultadoCnpj.semDado.includes(f.chave)).map((f) => `${f.rotulo} ${f.onde}.`).join(" ")}</p>
                        )}
                        {resultadoCnpj.diferentes.length > 0 && (
                          <div className="rounded-lg border border-[rgba(243,133,37,0.35)] bg-[rgba(243,133,37,0.06)] px-2.5 py-2">
                            <p className="font-semibold text-[#B45309]">A Receita informa valor diferente do que está no cadastro (mantive o seu): {resultadoCnpj.diferentes.map((d) => CAMPOS_CADASTRO.find((c) => c.chave === d.chave)?.rotulo || d.chave).join(", ")}.</p>
                            <button type="button" onClick={usarDadosDaReceita} className="mt-1.5 rounded-lg border border-[#B45309] bg-white px-2.5 py-1 text-[11px] font-bold text-[#B45309] hover:bg-[#FEF3E2]">Usar os dados da Receita nestes campos</button>
                          </div>
                        )}
                        {resultadoCnpj.avisos.map((a) => <p key={a} className={`font-semibold ${/Situação cadastral/.test(a) ? "text-[#C81E4A]" : "text-[#6B7280]"}`}>{/Situação cadastral/.test(a) ? "⚠ " : "ⓘ "}{a}</p>)}
                      </div>
                    )}
                  </div>
                  <div><label htmlFor="lc-ie" className={LBL}>Inscrição Estadual{chips("inscricaoEstadual")}</label><input id="lc-ie" value={form.inscricaoEstadual} onChange={(e) => setField("inscricaoEstadual", limparInscricaoEstadual(e.target.value))} aria-invalid={!!erros.inscricaoEstadual} className={inpCls("inscricaoEstadual")} placeholder="Só números, ou ISENTO" />{erros.inscricaoEstadual ? <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.inscricaoEstadual}</p> : <p className="mt-1 text-[11px] text-[#6B7280]">De 2 a 14 números.</p>}</div>
                  <div><label htmlFor="lc-im" className={LBL}>Inscrição Municipal{chips("inscricaoMunicipal")}</label><input id="lc-im" value={form.inscricaoMunicipal} onChange={(e) => setField("inscricaoMunicipal", e.target.value.slice(0, 20))} className={INP} /></div>
                  <div><label htmlFor="lc-cnae" className={LBL}>CNAE Principal{chips("cnaePrincipal")}</label><input id="lc-cnae" value={mascaraCnae(form.cnaePrincipal)} onChange={(e) => setField("cnaePrincipal", soDig(e.target.value).slice(0, 7))} className={`${INP} font-mono`} placeholder="0000-0/00" /></div>
                  <div><label htmlFor="lc-seg" className={LBL}>Segmento do estabelecimento{chips("segmento")}</label>
                    <select id="lc-seg" value={form.segmento || ""} onChange={(e) => setField("segmento", e.target.value)} className={inpCls("segmento")}>
                      <option value="">Selecione…</option>{SEGMENTOS_LOJA.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-[#6B7280]">Nome no Pedido Prime e Razão Social são conceitos diferentes — um não substitui o outro automaticamente.</p>
                </div>
              )}

              {/* ══ FISCAL ══ */}
              {aba === "fiscal" && (
                <div role="tabpanel" id="panel-fiscal" aria-labelledby="tab-fiscal" className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="lc-crt" className={LBL}>Regime Tributário (CRT) *{chips("crt")}</label>
                    <select id="lc-crt" value={form.crt || ""} onChange={(e) => setField("crt", e.target.value)} aria-invalid={!!erros.crt} className={inpCls("crt")}>
                      <option value="">Selecione o regime…</option>{CRT_OPCOES.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.descricao}</option>)}
                    </select>
                    {form.crt && <p className="mt-1 text-[11px] text-[#6B7280]">Selecionado: {rotuloCrt(form.crt)}</p>}
                  </div>
                  <div className="sm:col-span-2 rounded-2xl border border-[#D1D5DB] bg-white p-4">
                    <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#012E46]">Configuração fiscal — {pct}%</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-[#111111] sm:grid-cols-3">
                      {[["CNPJ/CPF", "CNPJ/CPF"], ["Razão Social", "Razão Social"], ["Inscrição Estadual", "Inscrição Estadual"], ["Regime Tributário (CRT)", "Regime Tributário (CRT)"], ["Endereço", "Logradouro"], ["Código IBGE do Município", "Código IBGE do Município"], ["UF", "UF"], ["Série NFC-e", "Série NFC-e"]].map(([lbl, chave]) => {
                        const pend = pendencias.includes(chave);
                        return <span key={lbl} className="flex items-center gap-1.5">{pend ? <span className="text-[#F38525]">⚠</span> : <span className="text-[#2F9E52]">✓</span>}{lbl}</span>;
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-[#6B7280]">Homologação/produção exigem o cadastro fiscal mínimo completo.</p>
                  </div>
                  {form.segmento && form.crt && form.uf && (
                    <div className="sm:col-span-2 rounded-2xl border border-[rgba(243,133,37,0.35)] bg-[rgba(243,133,37,0.06)] p-4">
                      <p className="text-[12px] font-bold text-[#012E46]">Configuração fiscal recomendada</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-[#111111]">{form.segmento} • {form.uf} • {rotuloCrt(form.crt).split(" — ")[1] || rotuloCrt(form.crt)}</p>
                      <p className="mt-1 text-[11px] text-[#6B7280]">Sugestão parametrizável. Confirme o enquadramento com a contabilidade do estabelecimento. Importe a regra em <b>Fiscal › Tributação → Biblioteca</b>.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ══ ENDEREÇO & CONTATO ══ */}
              {aba === "endereco" && (
                <div role="tabpanel" id="panel-endereco" aria-labelledby="tab-endereco" className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="lc-cep" className={LBL}>CEP{chips("cep")}</label><input id="lc-cep" inputMode="numeric" value={mascaraCep(form.cep)} onChange={(e) => setField("cep", soDig(e.target.value).slice(0, 8))} aria-invalid={!!erros.cep} className={`${inpCls("cep")} font-mono`} placeholder="00000-000" />{erros.cep && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.cep}</p>}</div>
                  <div><label htmlFor="lc-uf" className={LBL}>UF{chips("uf")}</label>
                    <select id="lc-uf" value={form.uf || ""} onChange={(e) => setField("uf", e.target.value)} className={inpCls("uf")}>
                      <option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {form.uf && codigoUf(form.uf) && <p className="mt-1 text-[11px] text-[#6B7280]">Código UF (derivado): {codigoUf(form.uf)}</p>}
                  </div>
                  <div className="sm:col-span-2"><label htmlFor="lc-log" className={LBL}>Logradouro{chips("logradouro")}</label><input id="lc-log" value={form.logradouro} onChange={(e) => setField("logradouro", e.target.value)} className={inpCls("logradouro")} /></div>
                  <div><label htmlFor="lc-num" className={LBL}>Número{chips("numero")}</label><input id="lc-num" value={form.numero} onChange={(e) => setField("numero", e.target.value)} className={inpCls("numero")} /></div>
                  <div><label htmlFor="lc-comp" className={LBL}>Complemento{chips("complemento")}</label><input id="lc-comp" value={form.complemento} onChange={(e) => setField("complemento", e.target.value)} className={INP} /></div>
                  <div><label htmlFor="lc-bairro" className={LBL}>Bairro{chips("bairro")}</label><input id="lc-bairro" value={form.bairro} onChange={(e) => setField("bairro", e.target.value)} className={inpCls("bairro")} /></div>
                  <div><label htmlFor="lc-mun" className={LBL}>Município{chips("municipio")}</label><input id="lc-mun" value={form.municipio} onChange={(e) => setField("municipio", e.target.value)} className={inpCls("municipio")} /></div>
                  <div><label htmlFor="lc-ibge" className={LBL}>Código IBGE do Município{chips("codigoMunicipioIbge")}</label><input id="lc-ibge" inputMode="numeric" value={form.codigoMunicipioIbge} onChange={(e) => setField("codigoMunicipioIbge", soDig(e.target.value).slice(0, 7))} aria-invalid={!!erros.codigoMunicipioIbge} className={`${inpCls("codigoMunicipioIbge")} font-mono`} placeholder="Ex.: 3550308" />{erros.codigoMunicipioIbge && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.codigoMunicipioIbge}</p>}</div>
                  <div><label htmlFor="lc-tel" className={LBL}>Telefone{chips("telefoneFiscal")}</label><input id="lc-tel" inputMode="numeric" value={mascaraTelefone(form.telefoneFiscal)} onChange={(e) => setField("telefoneFiscal", soDig(e.target.value).slice(0, 11))} aria-invalid={!!erros.telefoneFiscal} className={inpCls("telefoneFiscal")} placeholder="(00) 00000-0000" />{erros.telefoneFiscal && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.telefoneFiscal}</p>}</div>
                  <div><label htmlFor="lc-email" className={LBL}>E-mail fiscal{chips("emailFiscal")}</label><input id="lc-email" type="email" value={form.emailFiscal} onChange={(e) => setField("emailFiscal", e.target.value)} aria-invalid={!!erros.emailFiscal} className={inpCls("emailFiscal")} placeholder="fiscal@empresa.com.br" />{erros.emailFiscal && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.emailFiscal}</p>}</div>
                </div>
              )}

              {/* ══ NF-e / NFC-e ══ */}
              {aba === "documentos" && (
                <div role="tabpanel" id="panel-documentos" aria-labelledby="tab-documentos" className="space-y-4">
                  <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#012E46]"><span>🧾</span>NFC-e — Modelo 65</h4>
                      <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#111111]"><input type="checkbox" checked={form.nfceHabilitada === true} onChange={(e) => setField("nfceHabilitada", e.target.checked)} className="h-4 w-4 accent-[#012E46]" />Habilitar NFC-e nesta loja</label>
                    </div>
                    {form.nfceHabilitada && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <span className={LBL}>Ambiente</span>
                          <div className="grid grid-cols-3 gap-2">
                            {AMBIENTES_NFCE.map((a) => {
                              const bloq = a.valor === "producao" ? PRODUCAO_BLOQUEADA : (a.valor === "homologacao" && !homologLiberada);
                              const sel = (form.nfceAmbiente || "simulacao") === a.valor;
                              const tom = a.valor === "producao" ? "text-[#6B7280]" : a.valor === "homologacao" ? "text-[#F38525]" : "text-[#012E46]";
                              return (
                                <button key={a.valor} type="button" disabled={bloq} onClick={() => escolherAmbiente(a.valor)}
                                  className={`rounded-xl border px-2 py-2 text-center text-[12px] font-bold transition ${sel ? "border-[#012E46] bg-[rgba(1,46,70,0.06)] text-[#012E46]" : `border-[#D1D5DB] bg-white ${tom} hover:bg-[#F9FAFB]`} ${bloq ? "cursor-not-allowed opacity-50" : ""}`}>
                                  {a.rotulo}{a.valor === "producao" && " 🔒"}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[11px] text-[#6B7280]">{AMBIENTES_NFCE.find((a) => a.valor === (form.nfceAmbiente || "simulacao"))?.nota}</p>
                        </div>
                        <div><label htmlFor="lc-serie" className={LBL}>Série NFC-e{chips("nfceSerie")}</label><input id="lc-serie" inputMode="numeric" value={form.nfceSerie ?? 1} onChange={(e) => setField("nfceSerie", soDig(e.target.value).slice(0, 3))} aria-invalid={!!erros.nfceSerie} className={`${inpCls("nfceSerie")} font-mono`} /><p className="mt-1 text-[11px] text-[#6B7280]">1 a 999 (leiaute NFC-e).</p>{erros.nfceSerie && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.nfceSerie}</p>}</div>
                        {form.nfceAmbiente === "homologacao" && !homologLiberada && <p className="sm:col-span-2 rounded-xl border border-[rgba(200,30,74,0.25)] bg-[rgba(200,30,74,0.06)] px-3 py-2 text-[12px] font-semibold text-[#C81E4A]">Não é possível ativar homologação — complete o cadastro fiscal mínimo (aba Fiscal/Endereço).</p>}
                      </div>
                    )}
                    <p className="mt-2 text-[12px] text-[#6B7280]">Situação: <b>{rotuloAmbienteNfce(form.nfceAmbiente)}</b>. Produção liberada após homologação; certificado e CSC serão necessários antes da transmissão à SEFAZ.</p>
                  </section>
                  <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#012E46]"><span>📄</span>NF-e — Modelo 55</h4>
                      <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#111111]"><input type="checkbox" checked={form.nfeHabilitada === true} onChange={(e) => setField("nfeHabilitada", e.target.checked)} className="h-4 w-4 accent-[#012E46]" />Habilitar NF-e nesta loja</label>
                    </div>
                    <p className="mt-2 text-[12px] text-[#6B7280]">Nota para cliente empresa (CNPJ), emitida no caixa quando o cliente pede. Usa o mesmo ambiente da NFC-e e uma série própria, cadastrada em Emissão fiscal.</p>
                  </section>
                </div>
              )}

              {/* ══ OPERAÇÃO ══ */}
              {aba === "operacao" && (
                <div role="tabpanel" id="panel-operacao" aria-labelledby="tab-operacao" className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="lc-pfx" className={LBL}>Prefixo da comanda *{chips("prefixo")}</label>
                    <input id="lc-pfx" value={form.prefixo} disabled={!operacaoEditavel} onChange={(e) => setField("prefixo", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))} aria-invalid={!!erros.prefixo} className={`${inpCls("prefixo")} font-mono tracking-widest ${!operacaoEditavel ? "opacity-60" : ""}`} placeholder="Ex.: PZB" />
                    {erros.prefixo ? <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erros.prefixo}</p>
                      : <p className="mt-1 text-[11px] text-[#6B7280]">Use de 2 a 5 letras (sem espaços). Comandas: {form.prefixo || "PFX"}-000001…</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <LojaHorarioFuncionamento value={form.funcionamento} onChange={(fn) => setField("funcionamento", fn)} modoUso={form.modoUso} readOnly={!operacaoEditavel} />
                  </div>
                  <div className="sm:col-span-2"><span className={LBL}>Modo de uso</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[["interno", "🖥️ Interno", "Tablets"], ["externo", "📱 Externo", "Cardápio do cliente"], ["ambos", "🔀 Ambos", "Os dois"]].map(([v, t, d]) => (
                        <button key={v} type="button" disabled={!operacaoEditavel} onClick={() => setField("modoUso", v)}
                          className={`rounded-xl border px-2 py-2.5 text-center transition ${form.modoUso === v ? "border-[#012E46] bg-[rgba(1,46,70,0.06)]" : "border-[#D1D5DB] bg-white hover:bg-[#F9FAFB]"} ${!operacaoEditavel ? "cursor-not-allowed opacity-60" : ""}`}>
                          <p className={`text-[12px] font-bold ${form.modoUso === v ? "text-[#012E46]" : "text-[#111111]"}`}>{t}</p>
                          <p className="mt-0.5 text-[10px] text-[#6B7280]">{d}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sm:col-span-2"><span className={LBL}>Logo do estabelecimento</span>
                    <div className="flex gap-3">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D1D5DB] bg-[#F9FAFB]">
                        {form.logoUrl ? <img src={form.logoUrl} alt="logo" className="h-full w-full object-contain p-1" /> : <span className="text-2xl opacity-40">🏷️</span>}
                        {uploadando && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#012E46] border-t-transparent" /></div>}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input ref={fileLogoRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={importarLogo} />
                        <div className="flex gap-2">
                          <button type="button" disabled={uploadando || !operacaoEditavel} onClick={() => fileLogoRef.current?.click()} className="flex-1 rounded-xl border border-[#D1D5DB] bg-white py-2.5 text-[12px] font-semibold text-[#111111] transition hover:bg-[#F3F4F6] disabled:opacity-50">📁 Importar logo</button>
                          {form.logoUrl && operacaoEditavel && <button type="button" onClick={() => setField("logoUrl", "")} className="rounded-xl border border-[rgba(200,30,74,0.24)] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#C81E4A] transition hover:bg-[rgba(200,30,74,0.06)]">🗑️</button>}
                        </div>
                        <input value={form.logoUrl} disabled={!operacaoEditavel} onChange={(e) => setField("logoUrl", e.target.value)} placeholder="ou cole a URL da logo…" className={`${INP} text-[12px]`} />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[#6B7280]">PNG, JPG ou WebP · máx. 2 MB · proporção quadrada (1:1). Aparece no tablet do cliente.</p>
                    {erroLogo && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">❌ {erroLogo}</p>}
                    {!operacaoEditavel && <p className="mt-1 text-[11px] text-[#6B7280]">Prefixo, modo de uso e logo são gerenciados pelo administrador da plataforma.</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé fixo */}
        <div className="shrink-0 space-y-2 border-t border-[#D1D5DB] px-5 py-3.5">
          {erroGeral && <p className="text-[12px] font-semibold text-[#C81E4A]">⚠ {erroGeral}</p>}
          <div className="flex gap-2">
            <button onClick={fecharComGuarda} className="rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] hover:bg-[#F3F4F6]">Cancelar</button>
            <button onClick={salvar} disabled={salvando || carregando || uploadando} className="flex-1 rounded-xl bg-[#012E46] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#013a58] disabled:opacity-40">{salvando ? "Salvando…" : ehEdicao ? "Salvar alterações" : "Cadastrar empresa"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LojaCadastroModal;
