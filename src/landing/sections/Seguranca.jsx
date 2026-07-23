import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { SEGURANCA } from "../content";

// "Segurança" — LGPD, backup, criptografia, permissões, auditoria, logs,
// controle de usuários e sessões.
export default function Seguranca() {
  return (
    <section className="bg-[var(--pp-graphite)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Segurança" titulo="Dados protegidos, do login ao backup"
          desc="Autenticação por usuário, permissões por perfil e trilha de auditoria — segurança pensada para operação real, não só para o discurso."
          className="[&_h2]:text-white [&_p]:text-white/60" />
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SEGURANCA.map((s, i) => (
            <Reveal as="article" key={s.titulo} delay={(i % 4) * 70}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur transition hover:bg-white/[0.08]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#D0A548]"><Icone nome={s.icon} className="h-5 w-5" /></span>
              <h3 className="font-display mt-3.5 text-sm font-bold text-white">{s.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-white/55">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
