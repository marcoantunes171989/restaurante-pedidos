// ════════════════════════════════════════════════════════════
//  Segurança de credenciais (FASE 7.2)
//
//  Utilitário PURO e reutilizável para garantir que nenhuma resposta de
//  autenticação / usuário carregue credenciais. Serve tanto para
//  sanitizar payloads (defesa em profundidade) quanto para os testes
//  anti-vazamento.
// ════════════════════════════════════════════════════════════

// Chaves que NUNCA podem sair para o cliente / log / auditoria.
export const CHAVES_SENSIVEIS = [
  'senha',
  'password',
  'senha_hash',
  'password_hash',
  'secret',
  'credential',
  'access_token',
  'refresh_token',
  'service_role',
]

const ehChaveSensivel = (chave) =>
  CHAVES_SENSIVEIS.includes(String(chave).toLowerCase())

/**
 * Detecta (recursivamente) se um valor contém ALGUMA chave sensível,
 * mesmo aninhada em objetos ou arrays. Usado nos testes anti-vazamento.
 */
export function contemChaveSensivel(valor) {
  if (Array.isArray(valor)) {
    return valor.some((item) => contemChaveSensivel(item))
  }
  if (valor && typeof valor === 'object') {
    for (const [chave, sub] of Object.entries(valor)) {
      if (ehChaveSensivel(chave)) return true
      if (contemChaveSensivel(sub)) return true
    }
  }
  return false
}

/**
 * Remove (recursivamente) toda chave sensível de um objeto/array, sem
 * mutar a entrada. Reutilizável para sanitizar qualquer payload antes de
 * devolvê-lo, registrá-lo em log ou gravá-lo em auditoria.
 */
export function removerChavesSensiveis(valor) {
  if (Array.isArray(valor)) {
    return valor.map((item) => removerChavesSensiveis(item))
  }
  if (valor && typeof valor === 'object') {
    const saida = {}
    for (const [chave, sub] of Object.entries(valor)) {
      if (ehChaveSensivel(chave)) continue
      saida[chave] = removerChavesSensiveis(sub)
    }
    return saida
  }
  return valor
}
