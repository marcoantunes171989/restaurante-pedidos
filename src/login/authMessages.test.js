import { describe, it, expect } from 'vitest'
import { mensagemPorCodigoAuth, ehErroInternoAuth } from './authMessages'

// Fase 7.2.3 (§21/§22): problema de infraestrutura NÃO pode virar "senha
// inválida"; credencial errada NÃO pode virar mensagem interna.
describe('mensagemPorCodigoAuth', () => {
  it('credencial inválida → mensagem de credencial', () => {
    expect(mensagemPorCodigoAuth('INVALID_CREDENTIALS')).toMatch(/e-mail ou senha/i)
  })
  it('usuário inativo → mensagem de inativo', () => {
    expect(mensagemPorCodigoAuth('INACTIVE')).toMatch(/inativo/i)
  })
  it.each([
    'AUTH_SYNC_FAILED', 'AUTH_SESSION_FAILED',
    'SERVICE_ROLE_MISSING', 'SERVICE_ROLE_INVALID', 'SERVER_ERROR',
  ])('%s → mensagem interna (não credencial)', (code) => {
    const msg = mensagemPorCodigoAuth(code)
    expect(msg).toMatch(/não foi possível concluir a autenticação/i)
    expect(msg).not.toMatch(/senha inválid/i)
  })
  it('nunca vaza detalhe técnico', () => {
    const msg = mensagemPorCodigoAuth('SERVICE_ROLE_INVALID')
    expect(msg).not.toMatch(/service_role|jwt|token|key|stack/i)
  })
})

describe('ehErroInternoAuth', () => {
  it('classifica infra como interno e credencial como não-interno', () => {
    expect(ehErroInternoAuth('SERVICE_ROLE_INVALID')).toBe(true)
    expect(ehErroInternoAuth('AUTH_SYNC_FAILED')).toBe(true)
    expect(ehErroInternoAuth('INVALID_CREDENTIALS')).toBe(false)
    expect(ehErroInternoAuth('INACTIVE')).toBe(false)
  })
})
