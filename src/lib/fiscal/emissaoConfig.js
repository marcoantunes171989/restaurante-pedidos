// ════════════════════════════════════════════════════════════
//  Regras da aba "Emissão" da Configuração Fiscal (puro, testável).
//  Situação do certificado, conferência dos códigos de pagamento,
//  validação do formulário de série e a lista "o que falta para emitir".
// ════════════════════════════════════════════════════════════

export const DIAS_ALERTA_CERTIFICADO = 30;
const DIA_MS = 86400000;

export function situacaoCertificado(cred, agora = new Date()) {
  if (!cred || !cred.validadeFim) return { estado: "ausente", dias: null, texto: "Nenhum certificado cadastrado." };
  const dias = Math.floor((new Date(cred.validadeFim) - agora) / DIA_MS);
  const data = new Date(cred.validadeFim).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (dias < 0) return { estado: "vencido", dias, texto: `Vencido em ${data}. Envie um certificado novo.` };
  if (dias <= DIAS_ALERTA_CERTIFICADO) return { estado: "vencendo", dias, texto: `Vence em ${dias} dias (${data}). Renove com a certificadora.` };
  return { estado: "ok", dias, texto: `Válido até ${data} (${dias} dias).` };
}

const ativa = (f) => f.active !== false && f.ativo !== false;

/** mapa: { [tipo] | ["id:<id>"]: "NN" } — o mesmo formato salvo na 175. */
export function conferirMapaMeios(formas = [], mapa = {}) {
  const semCodigo = [];
  const invalidos = [];
  for (const f of formas.filter(ativa)) {
    const cod = mapa?.[`id:${f.id}`] ?? mapa?.[f.tipo];
    if (cod == null || cod === "") semCodigo.push(f.nome);
    else if (!/^[0-9]{2}$/.test(String(cod))) invalidos.push(f.nome);
  }
  return { ok: semCodigo.length === 0 && invalidos.length === 0, semCodigo, invalidos };
}

export function validarSerieForm({ modelo, ambiente, serie, proximoNumero } = {}) {
  const erros = [];
  if (![55, 65].includes(Number(modelo))) erros.push("Escolha NF-e (55) ou NFC-e (65).");
  if (!["homologacao", "producao"].includes(ambiente)) erros.push("Escolha o ambiente.");
  if (!/^(0|[1-9][0-9]{0,2})$/.test(String(serie ?? ""))) erros.push("Série deve ser um número de 0 a 999.");
  if (!/^[1-9][0-9]{0,8}$/.test(String(proximoNumero ?? ""))) erros.push("Próximo número deve ser de 1 a 999.999.999.");
  return erros;
}

/**
 * Lista do que falta para emitir em HOMOLOGAÇÃO (testes na SEFAZ).
 * @returns {{ pronto:boolean, itens:Array<{id,rotulo,ok,dica}> }}
 */
export function prontidaoEmissao({ emitente = null, credenciais = [], series = [], formas = [], config = {}, agora = new Date() } = {}) {
  const cert = credenciais.find((c) => c.tipo === "certificado_a1") || null;
  const sc = situacaoCertificado(cert, agora);
  const temSerie = (modelo) => series.some((s) => Number(s.modelo) === modelo && s.ambiente === "homologacao" && s.ativa);
  const mapa = conferirMapaMeios(formas, config?.mapaMeios || {});
  const itens = [
    { id: "emitente", rotulo: "NFC-e ou NF-e habilitada no cadastro do emitente", ok: !!(emitente?.nfceHabilitada || emitente?.nfeHabilitada), dica: "Configure em Minha Empresa." },
    { id: "regime", rotulo: "Regime tributário (CRT) informado", ok: ["1", "2", "3", "4"].includes(String(emitente?.crt || "")), dica: "Informe o CRT no cadastro do emitente." },
    { id: "certificado", rotulo: "Certificado A1 válido", ok: sc.estado === "ok" || sc.estado === "vencendo", dica: sc.texto },
    { id: "serie", rotulo: "Série da NFC-e em homologação", ok: !emitente?.nfceHabilitada || temSerie(65), dica: "Cadastre a série e o próximo número abaixo." },
  ];
  if (emitente?.nfeHabilitada) itens.push({ id: "serie55", rotulo: "Série da NF-e em homologação", ok: temSerie(55), dica: "Cadastre a série da NF-e (separada da NFC-e)." });
  itens.push(
    { id: "pagamentos", rotulo: "Código fiscal de cada forma de pagamento", ok: mapa.ok, dica: mapa.ok ? "" : `Faltam: ${[...mapa.semCodigo, ...mapa.invalidos].join(", ")}.` },
    { id: "taxa", rotulo: "Regra da taxa de serviço na nota", ok: ["outras_despesas", "fora_da_nota"].includes(config?.taxaServicoTratamento), dica: "Defina com o contador." },
  );
  return { pronto: itens.every((i) => i.ok), itens };
}
