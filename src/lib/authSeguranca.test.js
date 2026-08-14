import { describe, it, expect } from 'vitest'
import { contemChaveSensivel, removerChavesSensiveis } from './authSeguranca'
import { mapUsuarioDb } from './supabase'

// ════════════════════════════════════════════════════════════
//  FASE 7.2 — Testes anti-vazamento de credenciais
//  Falham se qualquer forma de resposta de usuário expuser senha /
//  password / *_hash / token — inclusive em propriedades aninhadas.
// ════════════════════════════════════════════════════════════

describe('contemChaveSensivel', () => {
  it('detecta senha no topo', () => {
    expect(contemChaveSensivel({ id: 1, senha: 'x' })).toBe(true)
  })
  it('detecta password aninhado em objeto', () => {
    expect(contemChaveSensivel({ usuario: { email: 'a@b.c', password: 'x' } })).toBe(true)
  })
  it('detecta senha_hash / password_hash', () => {
    expect(contemChaveSensivel({ a: { senha_hash: '...' } })).toBe(true)
    expect(contemChaveSensivel({ a: [{ password_hash: '...' }] })).toBe(true)
  })
  it('detecta token dentro de array', () => {
    expect(contemChaveSensivel([{ ok: true }, { access_token: 'jwt' }])).toBe(true)
  })
  it('não acusa objeto sem credencial', () => {
    expect(contemChaveSensivel({ id: 1, nome: 'A', email: 'a@b.c', perfil: 'Gestor' })).toBe(false)
  })
})

describe('removerChavesSensiveis', () => {
  it('remove senha aninhada sem mutar a entrada', () => {
    const entrada = { ok: true, usuario: { id: 1, email: 'a@b.c', senha: 'segredo' } }
    const limpo = removerChavesSensiveis(entrada)
    expect(contemChaveSensivel(limpo)).toBe(false)
    expect(limpo.usuario.email).toBe('a@b.c')
    // não muta a entrada original
    expect(entrada.usuario.senha).toBe('segredo')
  })
  it('remove token e mantém demais campos em arrays', () => {
    const limpo = removerChavesSensiveis([{ id: 1, refresh_token: 'r' }, { id: 2 }])
    expect(limpo).toEqual([{ id: 1 }, { id: 2 }])
  })
})

describe('mapUsuarioDb — nunca expõe senha nem hash do banco', () => {
  it('descarta senha e senha_hash mesmo quando presentes na linha', () => {
    const row = {
      id: 7, nome: 'Ana', email: 'ana@x.com',
      senha: 'super-secreta', senha_hash: '$2a$10$abcdefghijklmnopqrstuv',
      perfil: 'Gestor', ativo: true, ids_acesso: ['admin'], loja_id: 3,
      cargo_id: 1, super_admin: false, permissoes_acoes: {},
    }
    const u = mapUsuarioDb(row)
    expect(u).not.toHaveProperty('password')
    expect(u).not.toHaveProperty('senha')
    expect(u).not.toHaveProperty('senha_hash')
    expect(u).not.toHaveProperty('password_hash')
    expect(contemChaveSensivel(u)).toBe(false)
    // continua trazendo o perfil operacional
    expect(u).toMatchObject({ id: 7, name: 'Ana', email: 'ana@x.com', role: 'Gestor', lojaId: 3 })
  })
})

describe('anti-vazamento de HASH (fase 7.2.1)', () => {
  it('detecta senha_hash / password_hash aninhados', () => {
    expect(contemChaveSensivel({ usuario: { id: 1, senha_hash: '$2a$...' } })).toBe(true)
    expect(contemChaveSensivel([{ ok: true }, { password_hash: '$2a$...' }])).toBe(true)
  })
  it('removerChavesSensiveis também remove hash', () => {
    const limpo = removerChavesSensiveis({ ok: true, usuario: { id: 1, senha_hash: '$2a$x' } })
    expect(contemChaveSensivel(limpo)).toBe(false)
    expect(limpo.usuario).toEqual({ id: 1 })
  })
  it('sanitiza a resposta da API de criação/edição (shape real)', () => {
    // Espelha o formato retornado por /api/gerenciar-usuario-auth.
    const resposta = {
      ok: true, id: 'auth-uuid', atualizado: false,
      usuario: {
        id: 42, email: 'x@y.com', nome: 'X', perfil: 'Caixa', ativo: true,
        loja_id: 3, cargo_id: 2, ids_acesso: ['cashier'],
        senha_hash: '$2a$10$naoDeveVazar', senha: null,
      },
    }
    const limpo = removerChavesSensiveis(resposta)
    expect(contemChaveSensivel(limpo)).toBe(false)
    expect(limpo.usuario.email).toBe('x@y.com')
    expect(limpo.usuario).not.toHaveProperty('senha_hash')
  })
})
