// ════════════════════════════════════════════════════════════
//  Parâmetros do caixa por empresa (migration 218): taxa de serviço e limites de desconto/acréscimo.
//  O servidor é quem decide (app_fechar_conta confere tudo); aqui as mesmas contas servem para a tela
//  avisar antes. Contas sempre em centavos, iguais às do banco.
// ════════════════════════════════════════════════════════════
import { TAXA_SERVICO_DEFAULT, orderTotal } from "../pages/pdv/pdvHelpers";
import { cobraTaxaServico } from "./taxaServico";

/** Teto do sistema: desconto e acréscimo nunca passam disto sobre o valor da compra (soma dos itens). */
export const TETO_PERCENTUAL = 99.99;

const SEM_LIMITE = Object.freeze({ percentualMax: null, valorMax: null });
export const PARAMETROS_PADRAO = Object.freeze({
  taxaServico: TAXA_SERVICO_DEFAULT, desconto: SEM_LIMITE, acrescimo: SEM_LIMITE, definido: false,
});

export const emCentavos = (v) => Math.round((Number(v) || 0) * 100);

/** Taxa de serviço em reais, arredondada ao centavo (como o servidor). */
export function valorDaTaxa(baseEmReais, percentual) {
  return Math.round((emCentavos(baseEmReais) * (Number(percentual) || 0)) / 100 + 1e-7) / 100;
}

/** A empresa cobra taxa nesta mesa? (retirada e entrega externas nunca) */
export function taxaDaMesa(taxaServico, mesa) {
  const t = taxaServico || TAXA_SERVICO_DEFAULT;
  return t.enabled !== false && t.chargingRule !== "nao_cobrar" && cobraTaxaServico(mesa) ? Number(t.percent) || 0 : 0;
}

/** Total de um pedido (itens + taxa de serviço da empresa), como o servidor calcula. */
export function totalDoPedido(pedido, taxaServico) {
  const itens = emCentavos(orderTotal(pedido)) / 100;
  return (emCentavos(itens) + emCentavos(valorDaTaxa(itens, taxaDaMesa(taxaServico, pedido?.table)))) / 100;
}

const numeroOuNulo = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Maior desconto (ou acréscimo) permitido, em reais, para uma compra. Com os dois limites, vale o menor. */
export function limiteEmReais(limite, compraEmReais) {
  const compra = Math.max(0, emCentavos(compraEmReais));
  const opcoes = [Math.floor((compra * 9999) / 10000)];
  const pct = numeroOuNulo(limite?.percentualMax);
  const val = numeroOuNulo(limite?.valorMax);
  if (pct !== null) opcoes.push(Math.floor((compra * Math.round(pct * 100)) / 10000));
  if (val !== null) opcoes.push(emCentavos(val));
  return Math.max(0, Math.min(...opcoes)) / 100;
}

/** Percentual usado enquanto a empresa não definiu o seu. */
export const PERCENTUAL_PADRAO = TAXA_SERVICO_DEFAULT.percent;

/** Percentual em texto: 12.5 → "12,5". */
export const textoDoPercentual = (p) => String(Math.round((Number(p) || 0) * 100) / 100).replace(".", ",");

/** Subtotal, taxa e total de vários pedidos, como o servidor calcula (retirada e entrega externas não pagam). */
export function resumoDosPedidos(pedidos, percentual) {
  let itens = 0;
  let base = 0;
  for (const p of pedidos || []) {
    const valor = emCentavos(orderTotal(p));
    itens += valor;
    if (cobraTaxaServico(p?.table)) base += valor;
  }
  const taxa = emCentavos(valorDaTaxa(base / 100, percentual));
  return { subtotal: itens / 100, taxa: taxa / 100, total: (itens + taxa) / 100 };
}

/** Taxa que o cardápio mostra, sem login (migration 219). null = banco sem a função. */
export async function buscarTaxaPublica(supabase, lojaId) {
  if (!supabase?.rpc || lojaId == null) return null;
  const { data, error } = await supabase.rpc("pub_taxa_servico", { p_loja_id: lojaId });
  if (error) { if (funcaoAusente(error)) return null; throw error; }
  const valido = (typeof data === "number" || (typeof data === "string" && data !== "")) && Number(data) >= 0;
  return valido ? Number(data) : null;
}

/** Texto do limite configurado, para a tela. */
export function textoDoLimite(limite) {
  const partes = [];
  const pct = numeroOuNulo(limite?.percentualMax);
  const val = numeroOuNulo(limite?.valorMax);
  if (pct !== null) partes.push(`${String(pct).replace(".", ",")}%`);
  if (val !== null) partes.push(`R$ ${val.toFixed(2).replace(".", ",")}`);
  return partes.length ? partes.join(" ou ") + (partes.length > 1 ? " (o menor)" : "") : `até ${String(TETO_PERCENTUAL).replace(".", ",")}% da compra`;
}

/** "12,5" → 12.5; vazio → null; texto inválido → NaN. */
export function lerNumeroDigitado(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const limpo = t.replace(/\s|R\$|%/g, "");
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Number(normal) : Number.NaN;
}

/** Formulário da tela de parâmetros → configuração a salvar, ou a mensagem do primeiro campo errado. */
export function configDoFormulario(form) {
  const campo = (texto, nome, maximo) => {
    const n = lerNumeroDigitado(texto);
    if (n === null) return { ok: true, valor: null };
    if (Number.isNaN(n)) return { ok: false, erro: `${nome}: informe um número com até duas casas.` };
    if (maximo != null && n > maximo) return { ok: false, erro: `${nome}: o máximo é ${String(maximo).replace(".", ",")}%.` };
    return { ok: true, valor: n };
  };
  const campos = {
    taxa: campo(form.taxaPercentual, "Percentual da taxa de serviço", TETO_PERCENTUAL),
    descPct: campo(form.descontoPercentual, "Desconto máximo em percentual", TETO_PERCENTUAL),
    descVal: campo(form.descontoValor, "Desconto máximo em reais", null),
    acrPct: campo(form.acrescimoPercentual, "Acréscimo máximo em percentual", TETO_PERCENTUAL),
    acrVal: campo(form.acrescimoValor, "Acréscimo máximo em reais", null),
  };
  const erro = Object.values(campos).find((c) => !c.ok);
  if (erro) return { ok: false, erro: erro.erro };
  return {
    ok: true,
    config: {
      taxaServico: {
        enabled: !!form.taxaAtiva, percent: campos.taxa.valor ?? 0,
        chargingRule: form.taxaRegra || "opcional", partialStrategy: form.taxaParcial || "proporcional_itens",
      },
      desconto: { percentualMax: campos.descPct.valor, valorMax: campos.descVal.valor },
      acrescimo: { percentualMax: campos.acrPct.valor, valorMax: campos.acrVal.valor },
    },
  };
}

export function formularioDosParametros(p = PARAMETROS_PADRAO) {
  const txt = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
  const t = { ...TAXA_SERVICO_DEFAULT, ...(p.taxaServico || {}) };
  return {
    taxaAtiva: t.enabled !== false, taxaPercentual: txt(t.percent), taxaRegra: t.chargingRule, taxaParcial: t.partialStrategy,
    descontoPercentual: txt(p.desconto?.percentualMax), descontoValor: txt(p.desconto?.valorMax),
    acrescimoPercentual: txt(p.acrescimo?.percentualMax), acrescimoValor: txt(p.acrescimo?.valorMax),
  };
}

const reais = (d) => `R$ ${String(d || "0").replace(".", ",")}`;
const RECUSAS = [
  ["desconto_acima_do_limite", (d) => `Desconto acima do limite da empresa. Máximo nesta conta: ${reais(d)}.`],
  ["acrescimo_acima_do_limite", (d) => `Acréscimo acima do limite da empresa. Máximo nesta conta: ${reais(d)}.`],
  ["motivo_do_ajuste_obrigatorio", () => "Informe o motivo do desconto ou do acréscimo."],
  ["venda_nao_pode_zerar", () => "A venda não pode ficar zerada. Reduza o desconto ou remova o cupom."],
  ["valor_recebido_insuficiente", (d) => `O valor recebido não cobre o total calculado pelo sistema. Faltam ${reais(d)}.`],
  ["troco_acima_do_permitido", () => "O troco só pode sair de pagamento em dinheiro. Ajuste os valores recebidos."],
  ["cupom_recusado", (d) => d || "Cupom indisponível. Remova o cupom para concluir."],
  ["pedido_ja_pago", () => "Esta conta já foi paga. Atualize a tela."],
  ["pedido_cancelado_nao_pode_ser_pago", () => "Há um pedido cancelado nesta conta. Atualize a tela."],
  ["pedido_nao_encontrado", () => "Um pedido desta conta não foi encontrado. Atualize a tela."],
  ["conta_de_empresas_diferentes", () => "Os pedidos desta conta são de empresas diferentes."],
  ["caixa_invalido", () => "O caixa informado não está aberto nesta empresa. Abra o caixa e tente de novo."],
  ["parcela_invalida", () => "Há um recebimento sem forma ou com valor zero."],
  ["pagamento_sem_parcelas", () => "Registre o recebimento antes de fechar a conta."],
  ["parametro_invalido", (d) => `Valor não aceito${d ? ` em ${d}` : ""}.`],
  ["forbidden", () => "Seu usuário não tem permissão para esta ação."],
];

/** Mensagem para o usuário quando o servidor recusa; null se o erro for outro. */
export function mensagemDeRecusaDoCaixa(erro) {
  const texto = String(erro?.message || "");
  const achada = RECUSAS.find(([codigo]) => texto.includes(codigo));
  return achada ? achada[1](String(erro?.details || "").trim()) : null;
}

/** A função ainda não existe neste banco (migration 218 não rodada). */
export function funcaoAusente(erro) {
  return !!erro && (erro.code === "PGRST202" || erro.code === "42883" || /could not find the function/i.test(String(erro.message || "")));
}

/** null = banco sem a migration 218 (o app segue como antes). */
export async function buscarParametrosCaixa(supabase, lojaId) {
  if (!supabase?.rpc || lojaId == null) return null;
  const { data, error } = await supabase.rpc("app_parametros_caixa", { p_loja_id: lojaId });
  if (error) { if (funcaoAusente(error)) return null; throw error; }
  // Resposta sem o formato esperado é tratada como indisponível.
  return data && typeof data.taxaServico === "object" ? data : null;
}

export async function salvarParametrosCaixa(supabase, lojaId, config) {
  const { data, error } = await supabase.rpc("app_salvar_parametros_caixa", { p_loja_id: lojaId, p_config: config });
  if (error) throw error;
  return data;
}

/** Fecha a conta no servidor. { ausente: true } quando o banco ainda não tem a função. */
export async function fecharContaNoServidor(supabase, f) {
  const { data, error } = await supabase.rpc("app_fechar_conta", {
    p_pedido_ids: f.pedidoIds,
    p_parcelas: (f.parcelas || []).map((p) => ({ forma: p.forma, valor: emCentavos(p.valor) / 100 })),
    p_desconto: emCentavos(f.desconto) / 100,
    p_acrescimo: emCentavos(f.acrescimo) / 100,
    p_taxa_removida: !!f.taxaRemovida,
    p_motivo: f.motivo || null,
    p_cupom_codigo: f.cupomCodigo || null,
    p_canal: f.canal === "externo" ? "externo" : "interno",
    p_manter_status: !!f.manterStatus,
    p_caixa_id: f.caixaId ?? null,
  });
  if (error) { if (funcaoAusente(error)) return { ausente: true }; throw error; }
  return { ausente: false, data };
}
