// Troca do ambiente de emissão da NFC-e (homologação ⇄ produção) com confirmação digitada.
// Funções puras: o que cada ambiente significa, qual palavra o usuário digita e o que impede a troca.

export const AMBIENTES = {
  homologacao: { id: "homologacao", rotulo: "Homologação", palavra: "HOMOLOGAÇÃO", curto: "teste, sem valor fiscal" },
  producao: { id: "producao", rotulo: "Produção", palavra: "PRODUÇÃO", curto: "com valor fiscal" },
};

const semAcento = (t) => String(t || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A pessoa digitou a palavra do ambiente de destino? (ignora maiúscula, acento e espaços nas pontas) */
export function palavraConfere(destino, texto) {
  const a = AMBIENTES[destino];
  return !!a && semAcento(texto) === semAcento(a.palavra);
}

/** Ambiente em uso, para mostrar na tela. "simulacao" (nada ligado) aparece como tal. */
export function ambienteAtual(nfceAmbiente) {
  if (nfceAmbiente === "producao") return { id: "producao", rotulo: "Produção", texto: "As notas têm valor fiscal e usam a numeração de produção." };
  if (nfceAmbiente === "homologacao") return { id: "homologacao", rotulo: "Homologação", texto: "As notas são de teste, sem valor fiscal." };
  return { id: "simulacao", rotulo: "Simulação", texto: "Nenhuma nota é enviada à SEFAZ." };
}

/** Para qual(is) ambiente(s) a pessoa pode ir a partir do atual. */
export function destinosPossiveis(nfceAmbiente) {
  return ["homologacao", "producao"].filter((d) => d !== nfceAmbiente);
}

/**
 * O que a troca faz e o que a bloqueia.
 * @param {"homologacao"|"producao"} destino
 * @param {{ producao?: {liberada?:boolean, faltas?:string[]}|null, series?:object[] }} ctx
 */
export function resumoDaTroca(destino, { producao = null, series = [] } = {}) {
  const serie = series.find((s) => Number(s.modelo) === 65 && s.ambiente === destino && s.ativa) || null;
  const proximo = serie ? `Próxima NFC-e de ${AMBIENTES[destino].rotulo.toLowerCase()}: nº ${serie.proximoNumero} (série ${serie.serie}).` : `Não há série de NFC-e ativa em ${AMBIENTES[destino].rotulo.toLowerCase()}.`;
  if (destino === "producao") {
    const faltas = Array.isArray(producao?.faltas) ? producao.faltas : null;
    const bloqueio = faltas == null ? "Não foi possível conferir se a produção está liberada. Atualize a tela." : (faltas.length ? faltas : null);
    return {
      destino, titulo: "Mudar para PRODUÇÃO",
      aviso: "A partir da confirmação, cada venda gera uma nota de verdade na SEFAZ, com impostos. Em SP um número emitido não volta atrás.",
      proximo, bloqueio, semSerie: !serie,
    };
  }
  return {
    destino, titulo: "Voltar para HOMOLOGAÇÃO",
    aviso: "As próximas notas serão de teste, sem valor fiscal. As notas de produção já emitidas continuam valendo e a numeração de cada ambiente é separada.",
    proximo, bloqueio: null, semSerie: !serie,
  };
}
