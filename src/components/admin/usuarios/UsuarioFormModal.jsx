import { useMemo, useState } from "react";
import {
  User, Building2, Mail, Lock, Eye, EyeOff, ShieldCheck, BadgeCheck,
  CircleDollarSign, ChefHat, Utensils, Monitor, X, Check, Loader2,
} from "lucide-react";
import {
  validarUsuarioForm, forcaSenha, agruparCargos, metaDoPerfil,
  mensagemErroUsuario, normalizarNome, normalizarEmail, SENHA_MIN,
} from "../../../lib/usuarioForm";

// Paleta oficial (clara) — sem dark mode, sem verde como ação.
const PETROLEO = "#012E46";
const LARANJA = "#F38525";
const BORDA = "#D1D5DB";

const ICONES = { ShieldCheck, BadgeCheck, CircleDollarSign, ChefHat, Utensils, Monitor, User };
function IconePerfil({ nome, className }) {
  const Cmp = ICONES[metaDoPerfil(nome).icone] || BadgeCheck;
  return <Cmp className={className} />;
}

/**
 * Modal ÚNICO de cadastro/edição de usuário (FASE 7.2.4).
 * props:
 *  - modo: "novo" | "editar"
 *  - usuario: (editar) usuário atual { id, name, email, lojaId, cargoId, role, active }
 *  - cargos, lojas: listas ativas
 *  - isSuperAdmin, lojaInfo
 *  - onSalvar: async (dados) => boolean  (true = sucesso → fecha)
 *  - onFechar: () => void
 */
export default function UsuarioFormModal({
  modo = "novo", usuario = null, cargos = [], lojas = [],
  isSuperAdmin = false, lojaInfo = null, onSalvar, onFechar,
}) {
  const edicao = modo === "editar";
  const exigeEmpresa = !!isSuperAdmin;

  const cargoInicial = useMemo(() => {
    if (!edicao) return "";
    if (usuario?.cargoId != null && usuario.cargoId !== "") return usuario.cargoId;
    const porNome = cargos.find(
      (c) => String(c.nome || "").toLowerCase() === String(usuario?.role || "").toLowerCase(),
    );
    return porNome?.id ?? "";
  }, [edicao, usuario, cargos]);

  const [form, setForm] = useState({
    nome: edicao ? (usuario?.name || "") : "",
    email: edicao ? (usuario?.email || "") : "",
    lojaId: edicao ? (usuario?.lojaId ?? "") : (isSuperAdmin ? "" : (lojaInfo?.id ?? "")),
    cargoId: cargoInicial,
    senha: "",
    confirmarSenha: "",
    ativo: edicao ? usuario?.active !== false : true,
  });
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [verConfirmar, setVerConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroServidor, setErroServidor] = useState("");

  const patch = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const marcar = (campo) => setTouched((t) => ({ ...t, [campo]: true }));

  const { valido, erros } = validarUsuarioForm(form, { modo, exigeEmpresa });
  const mostrar = (campo) => (touched[campo] || submitAttempted) && erros[campo];

  const gruposCargo = useMemo(() => agruparCargos(cargos), [cargos]);
  const cargoSel = cargos.find((c) => String(c.id) === String(form.cargoId));
  const lojaSel = lojas.find((l) => String(l.id) === String(form.lojaId)) || (!isSuperAdmin ? lojaInfo : null);
  const forca = forcaSenha(form.senha);

  async function submeter() {
    setSubmitAttempted(true);
    setErroServidor("");
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      const dados = {
        name: normalizarNome(form.nome),
        email: normalizarEmail(form.email),
        password: form.senha ? form.senha : undefined, // senha sem trim (§47)
        role: cargoSel?.nome || usuario?.role || "Operador",
        cargoId: form.cargoId || null,
        lojaId: form.lojaId || (isSuperAdmin ? null : lojaInfo?.id) || null,
        active: !!form.ativo,
      };
      const ok = await onSalvar?.(dados);
      // Zera credenciais do state local imediatamente (§19/§32).
      setForm((f) => ({ ...f, senha: "", confirmarSenha: "" }));
      if (ok !== false) { onFechar?.(); return; }
      setErroServidor(mensagemErroUsuario(null, "Não foi possível salvar. Tente novamente."));
    } catch (e) {
      setErroServidor(mensagemErroUsuario(e?.code, e?.message));
    } finally {
      setSalvando(false);
    }
  }

  // ── estilos (paleta oficial) ─────────────────────────────
  const secao = "rounded-xl border p-4 sm:p-5";
  const secaoStyle = { borderColor: BORDA, background: "#FFFFFF" };
  const label = "mb-1 block text-sm font-semibold text-[#111111]";
  const help = "mt-1 text-xs text-[#6B7280]";
  const inputBase = "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#111111] outline-none transition placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#012E46]/30 focus:border-[#012E46]";
  const inputCls = (campo) => `${inputBase} ${mostrar(campo) ? "border-red-500" : ""}`;
  const inputStyle = (campo) => (mostrar(campo) ? {} : { borderColor: BORDA });
  const tituloSecao = "mb-1 flex items-center gap-2 text-sm font-bold text-[#012E46]";

  const erroDe = (campo) =>
    mostrar(campo) ? <p className="mt-1 text-xs text-red-600" role="alert">{erros[campo]}</p> : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "92vh", border: `1px solid ${BORDA}` }}
        role="dialog" aria-modal="true" aria-label={edicao ? "Editar usuário" : "Novo usuário"}
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: BORDA }}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: PETROLEO }}>
              <User className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#111111]">{edicao ? "Editar usuário" : "Novo usuário"}</h2>
              <p className="text-xs text-[#6B7280]">
                {edicao ? "Atualize os dados de acesso, perfil e permissões." : "Cadastre o acesso e defina as permissões do usuário."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="rounded-lg border p-2 text-[#6B7280] hover:bg-[#F3F4F6]" style={{ borderColor: BORDA }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Empresa */}
          <section className={secao} style={secaoStyle}>
            <div className={tituloSecao}><Building2 className="h-4 w-4" /> Empresa do usuário</div>
            <p className="mb-3 text-xs text-[#6B7280]">Define em qual estabelecimento este usuário poderá operar.</p>
            {isSuperAdmin ? (
              <>
                {lojas.length === 0 && <p className="text-xs text-amber-600">Nenhuma empresa ativa.</p>}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lojas.map((l) => {
                    const sel = String(form.lojaId) === String(l.id);
                    return (
                      <button key={l.id} type="button" role="radio" aria-checked={sel}
                        onClick={() => { patch("lojaId", l.id); marcar("lojaId"); }}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#012E46]/30"
                        style={sel ? { background: PETROLEO, borderColor: PETROLEO, color: "#fff" } : { borderColor: BORDA, color: "#111111" }}>
                        <Building2 className="h-4 w-4 shrink-0" style={{ color: sel ? LARANJA : "#6B7280" }} />
                        <span className="truncate">{l.nome}</span>
                        {sel && <Check className="ml-auto h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {erroDe("lojaId")}
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: BORDA, background: "#F9FAFB" }}>
                <Building2 className="h-4 w-4" style={{ color: PETROLEO }} />
                <span className="text-[#111111]">Vinculado a <b>{lojaInfo?.nome || "—"}</b></span>
              </div>
            )}
          </section>

          {/* Dados do usuário */}
          <section className={secao} style={secaoStyle}>
            <div className={tituloSecao}><User className="h-4 w-4" /> Dados do usuário</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="uf-nome" className={label}>Nome completo *</label>
                <input id="uf-nome" value={form.nome} onChange={(e) => patch("nome", e.target.value)} onBlur={() => marcar("nome")}
                  placeholder="Ex.: Maria Souza" autoComplete="off"
                  aria-invalid={!!mostrar("nome")} aria-describedby={mostrar("nome") ? "uf-nome-err" : undefined}
                  className={inputCls("nome")} style={inputStyle("nome")} />
                {mostrar("nome") && <p id="uf-nome-err" className="mt-1 text-xs text-red-600" role="alert">{erros.nome}</p>}
              </div>
              <div>
                <label htmlFor="uf-email" className={label}>E-mail de acesso *</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input id="uf-email" type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} onBlur={() => marcar("email")}
                    placeholder="usuario@empresa.com" autoComplete="off"
                    aria-invalid={!!mostrar("email")} aria-describedby={mostrar("email") ? "uf-email-err" : undefined}
                    className={`${inputCls("email")} pl-9`} style={inputStyle("email")} />
                </div>
                {mostrar("email")
                  ? <p id="uf-email-err" className="mt-1 text-xs text-red-600" role="alert">{erros.email}</p>
                  : <p className={help}>O login é feito com este e-mail.</p>}
              </div>
            </div>
          </section>

          {/* Acesso (senha) */}
          <section className={secao} style={secaoStyle}>
            <div className={tituloSecao}><Lock className="h-4 w-4" /> Acesso à plataforma</div>
            <p className="mb-3 text-xs text-[#6B7280]">
              {edicao ? "Deixe os dois campos em branco para manter a senha atual." : "Defina as credenciais utilizadas para entrar no sistema."}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="uf-senha" className={label}>{edicao ? "Nova senha" : "Senha *"}</label>
                <div className="relative">
                  <input id="uf-senha" type={verSenha ? "text" : "password"} value={form.senha}
                    onChange={(e) => patch("senha", e.target.value)} onBlur={() => marcar("senha")}
                    placeholder={edicao ? "Deixe em branco para manter" : `Mínimo ${SENHA_MIN} caracteres`}
                    autoComplete="new-password"
                    aria-invalid={!!mostrar("senha")}
                    className={`${inputCls("senha")} pr-10`} style={inputStyle("senha")} />
                  <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#6B7280] hover:text-[#012E46]">
                    {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {erroDe("senha")}
              </div>
              <div>
                <label htmlFor="uf-confirmar" className={label}>{edicao ? "Confirmar nova senha" : "Confirmar senha *"}</label>
                <div className="relative">
                  <input id="uf-confirmar" type={verConfirmar ? "text" : "password"} value={form.confirmarSenha}
                    onChange={(e) => patch("confirmarSenha", e.target.value)} onBlur={() => marcar("confirmarSenha")}
                    placeholder="Repita a senha" autoComplete="new-password"
                    aria-invalid={!!mostrar("confirmarSenha")}
                    className={`${inputCls("confirmarSenha")} pr-10`} style={inputStyle("confirmarSenha")} />
                  <button type="button" onClick={() => setVerConfirmar((v) => !v)} aria-label={verConfirmar ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#6B7280] hover:text-[#012E46]">
                    {verConfirmar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {erroDe("confirmarSenha")}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#6B7280]">
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: form.senha.length >= SENHA_MIN ? "#059669" : BORDA }} /> mínimo {SENHA_MIN} caracteres</span>
              {form.confirmarSenha.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" style={{ color: form.senha && form.senha === form.confirmarSenha ? "#059669" : BORDA }} /> confirmação igual
                </span>
              )}
              {forca && <span className="ml-auto font-semibold" style={{ color: forca === "forte" ? "#059669" : forca === "media" ? LARANJA : "#DC2626" }}>força: {forca}</span>}
            </div>
          </section>

          {/* Cargo / Perfil */}
          <section className={secao} style={secaoStyle}>
            <div className={tituloSecao}><ShieldCheck className="h-4 w-4" /> Cargo / Perfil</div>
            <p className="mb-3 text-xs text-[#6B7280]">Define a função principal e os acessos iniciais do usuário.</p>
            {cargos.length === 0 && <p className="text-xs text-amber-600">Nenhum cargo cadastrado. Cadastre em “Cargos”.</p>}
            <div className="space-y-3">
              {gruposCargo.map(({ grupo, cargos: doGrupo }) => (
                <div key={grupo}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{grupo}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {doGrupo.map((c) => {
                      const sel = String(form.cargoId) === String(c.id);
                      return (
                        <button key={c.id} type="button" role="radio" aria-checked={sel}
                          onClick={() => { patch("cargoId", c.id); marcar("cargoId"); }}
                          className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#012E46]/30"
                          style={sel ? { background: PETROLEO, borderColor: PETROLEO, color: "#fff" } : { borderColor: BORDA, color: "#111111" }}>
                          <IconePerfil nome={c.nome} className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{c.nome}</span>
                            <span className="block text-xs" style={{ color: sel ? "rgba(255,255,255,0.8)" : "#6B7280" }}>
                              {c.descricao || metaDoPerfil(c.nome).descricao}
                            </span>
                          </span>
                          {sel && <Check className="ml-auto h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {erroDe("cargoId")}
          </section>

          {/* Status (só edição) */}
          {edicao && (
            <section className={secao} style={secaoStyle}>
              <div className={tituloSecao}><BadgeCheck className="h-4 w-4" /> Status</div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#6B7280]">Usuários inativos não conseguem acessar a plataforma.</p>
                <button type="button" role="switch" aria-checked={form.ativo} onClick={() => patch("ativo", !form.ativo)}
                  className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
                  style={{ background: form.ativo ? PETROLEO : BORDA }}>
                  <span className="inline-block h-5 w-5 transform rounded-full bg-white transition" style={{ transform: form.ativo ? "translateX(22px)" : "translateX(2px)" }} />
                </button>
              </div>
              <p className="mt-1 text-sm font-semibold" style={{ color: form.ativo ? "#059669" : "#DC2626" }}>{form.ativo ? "Ativo" : "Inativo"}</p>
            </section>
          )}

          {/* Resumo */}
          <div className="rounded-lg border px-4 py-3 text-xs" style={{ borderColor: BORDA, background: "#F9FAFB" }}>
            <span className="text-[#6B7280]">Empresa: </span><b className="text-[#111111]">{lojaSel?.nome || (isSuperAdmin ? "—" : lojaInfo?.nome || "—")}</b>
            <span className="mx-2 text-[#D1D5DB]">|</span>
            <span className="text-[#6B7280]">Perfil: </span><b className="text-[#111111]">{cargoSel?.nome || "—"}</b>
            <span className="mx-2 text-[#D1D5DB]">|</span>
            <span className="text-[#6B7280]">E-mail: </span><b className="text-[#111111]">{normalizarEmail(form.email) || "—"}</b>
          </div>

          {erroServidor && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{erroServidor}</div>
          )}
          {submitAttempted && !valido && !erroServidor && (
            <p className="text-xs text-[#6B7280]">Preencha os campos obrigatórios destacados para continuar.</p>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t px-5 py-4" style={{ borderColor: BORDA }}>
          <button type="button" onClick={onFechar} disabled={salvando}
            className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-[#111111] hover:bg-[#F3F4F6] disabled:opacity-50"
            style={{ borderColor: BORDA }}>
            Cancelar
          </button>
          <button type="button" onClick={submeter} disabled={!valido || salvando}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: PETROLEO }}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {salvando ? "Salvando..." : edicao ? "Salvar alterações" : "Cadastrar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}
