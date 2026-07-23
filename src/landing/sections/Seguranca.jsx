import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { SEGURANCA } from "../content";

// "Segurança" — LGPD, backup, criptografia, permissões, auditoria, logs,
// controle de usuários e sessões. Fundo claro (paleta oficial).
export default function Seguranca() {
  return (
    <section className="section bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Segurança" titulo="Dados protegidos, do login ao backup"
          desc="Autenticação por usuário, permissões por perfil e trilha de auditoria — segurança pensada para operação real, não só para o discurso." />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SEGURANCA.map((s, i) => (
            <Reveal as="article" key={s.titulo} delay={(i % 4) * 70}
              className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-5 transition hover:-translate-y-1 hover:border-[#C63F1D]/30">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#C63F1D]/20 bg-white text-[var(--pp-primary-hover)]"><Icone nome={s.icon} className="h-5 w-5" /></span>
              <h3 className="font-display mt-3.5 text-sm font-bold text-[var(--pp-graphite)]">{s.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--pp-text-muted)]">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
