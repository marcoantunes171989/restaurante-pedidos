import { Headphones, PlayCircle, Settings2 } from "lucide-react";
import { CardTitle, Reveal, SectionHeading } from "../ui";

const steps = [
  { icon: PlayCircle, number: "01", title: "Apresentação personalizada", text: "Conhecemos sua rotina e mostramos, na prática, os recursos mais relevantes para o seu modelo de atendimento." },
  { icon: Settings2, number: "02", title: "Configuração da operação", text: "Mesas, comandas, setores, produtos, usuários e permissões são organizados conforme a estrutura do estabelecimento." },
  { icon: Headphones, number: "03", title: "Acompanhamento humano", text: "Sua equipe recebe orientação para começar com segurança e conta com suporte especializado durante a utilização." },
];

export default function GettingStartedSection() {
  return <section className="section bg-[#F4F6F7]">
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <SectionHeading badge="Comece com segurança" titulo="Tecnologia completa," tituloAccent="implantação próxima." desc="O Pedido Prime é apresentado e configurado a partir da realidade da sua operação — sem fórmulas genéricas." />
      <ol className="mt-10 grid gap-4 md:grid-cols-3">{steps.map(({ icon: Icon, number, title, text }, index) => <Reveal as="li" key={number} delay={index * 70} className="relative overflow-hidden rounded-3xl border border-[#012E46]/10 bg-white p-6 shadow-[0_16px_40px_-32px_rgba(1,46,70,.5)]">
        <span className="absolute right-5 top-4 text-5xl font-bold text-[#012E46]/[.05]">{number}</span>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F38525] text-[#012E46]"><Icon className="h-6 w-6" /></span>
        <CardTitle className="mt-5">{title}</CardTitle><p className="mt-2 text-sm leading-6 text-[#496675]">{text}</p>
      </Reveal>)}</ol>
      <p className="mx-auto mt-7 max-w-3xl text-center text-sm font-semibold text-[#012E46]/70">Uma única plataforma para conectar atendimento, produção, caixa, estoque, clientes e gestão.</p>
    </div>
  </section>;
}
