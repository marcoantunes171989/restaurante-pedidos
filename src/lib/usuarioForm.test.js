import { describe, it, expect } from 'vitest'
import {
  validarUsuarioForm, emailValido, normalizarEmail, normalizarNome,
  forcaSenha, agruparCargos, metaDoPerfil, mensagemErroUsuario, SENHA_MIN,
} from './usuarioForm'

describe('emailValido / normalização', () => {
  it('aceita e-mail bem formado', () => {
    expect(emailValido('usuario@empresa.com')).toBe(true)
  })
  it.each(['marco', 'marco@', '@empresa.com', 'marco empresa@email.com', ''])(
    'rejeita "%s"', (e) => expect(emailValido(e)).toBe(false),
  )
  it('normaliza e-mail (lower+trim) e nome (trim)', () => {
    expect(normalizarEmail('  Marco@Empresa.COM ')).toBe('marco@empresa.com')
    expect(normalizarNome('  Marco  ')).toBe('Marco')
  })
})

describe('validarUsuarioForm — modo novo', () => {
  const base = { nome: 'Ana', email: 'ana@x.com', lojaId: 3, cargoId: 1, senha: 'abc123', confirmarSenha: 'abc123' }
  it('form completo é válido', () => {
    expect(validarUsuarioForm(base, { modo: 'novo' }).valido).toBe(true)
  })
  it('nome vazio', () => {
    expect(validarUsuarioForm({ ...base, nome: ' ' }, { modo: 'novo' }).erros.nome).toBeTruthy()
  })
  it('email inválido', () => {
    expect(validarUsuarioForm({ ...base, email: 'marco@' }, { modo: 'novo' }).erros.email).toBeTruthy()
  })
  it('empresa ausente (quando exigida)', () => {
    expect(validarUsuarioForm({ ...base, lojaId: '' }, { modo: 'novo', exigeEmpresa: true }).erros.lojaId).toBeTruthy()
  })
  it('empresa não exigida (gestor) não bloqueia', () => {
    expect(validarUsuarioForm({ ...base, lojaId: '' }, { modo: 'novo', exigeEmpresa: false }).valido).toBe(true)
  })
  it('perfil ausente', () => {
    expect(validarUsuarioForm({ ...base, cargoId: '' }, { modo: 'novo' }).erros.cargoId).toBeTruthy()
  })
  it('senha obrigatória no novo', () => {
    expect(validarUsuarioForm({ ...base, senha: '', confirmarSenha: '' }, { modo: 'novo' }).erros.senha).toBeTruthy()
  })
  it(`senha < ${SENHA_MIN}`, () => {
    expect(validarUsuarioForm({ ...base, senha: 'a1', confirmarSenha: 'a1' }, { modo: 'novo' }).erros.senha).toBeTruthy()
  })
  it('confirmação diferente', () => {
    expect(validarUsuarioForm({ ...base, confirmarSenha: 'outra9' }, { modo: 'novo' }).erros.confirmarSenha).toBeTruthy()
  })
})

describe('validarUsuarioForm — modo editar', () => {
  const base = { nome: 'Ana', email: 'ana@x.com', lojaId: 3, cargoId: 1 }
  it('sem senha é válido (mantém a atual)', () => {
    expect(validarUsuarioForm(base, { modo: 'editar' }).valido).toBe(true)
  })
  it('senha preenchida exige confirmação igual', () => {
    const r = validarUsuarioForm({ ...base, senha: 'nova123', confirmarSenha: 'nova124' }, { modo: 'editar' })
    expect(r.erros.confirmarSenha).toBeTruthy()
  })
  it('senha nova válida + confirmação igual passa', () => {
    expect(validarUsuarioForm({ ...base, senha: 'nova123', confirmarSenha: 'nova123' }, { modo: 'editar' }).valido).toBe(true)
  })
})

describe('forcaSenha', () => {
  it('classifica fraca/forte', () => {
    expect(forcaSenha('abc')).toBe('fraca')
    expect(forcaSenha('Abcdef12!x')).toBe('forte')
  })
  it('vazia → null', () => expect(forcaSenha('')).toBeNull())
})

describe('agruparCargos / metaDoPerfil', () => {
  it('agrupa perfis conhecidos e joga desconhecido em Outros', () => {
    const cargos = [
      { id: 1, nome: 'Gestor' }, { id: 2, nome: 'Caixa' }, { id: 3, nome: 'Cozinha' },
      { id: 4, nome: 'Painel' }, { id: 5, nome: 'Consultor' },
    ]
    const grupos = agruparCargos(cargos)
    const g = (n) => grupos.find((x) => x.grupo === n)
    expect(g('Gestão').cargos.map((c) => c.id)).toEqual([1])
    expect(g('Atendimento').cargos.map((c) => c.id)).toEqual([2])
    expect(g('Produção').cargos.map((c) => c.id)).toEqual([3])
    expect(g('Exibição').cargos.map((c) => c.id)).toEqual([4])
    expect(g('Outros').cargos.map((c) => c.id)).toEqual([5])
  })
  it('metaDoPerfil traz ícone e descrição', () => {
    expect(metaDoPerfil('Caixa').icone).toBe('CircleDollarSign')
    expect(metaDoPerfil('desconhecido').descricao).toBeTruthy()
  })
})

describe('mensagemErroUsuario', () => {
  it('DUPLICATE → mensagem de e-mail', () => {
    expect(mensagemErroUsuario('DUPLICATE')).toMatch(/já está vinculado/i)
  })
  it('AUTH_SYNC_FAILED → mensagem de acesso, sem detalhe técnico', () => {
    const m = mensagemErroUsuario('AUTH_SYNC_FAILED')
    expect(m).toMatch(/acesso do usuário/i)
    expect(m).not.toMatch(/service_role|jwt|token/i)
  })
})
