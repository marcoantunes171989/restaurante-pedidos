import { ChevronDown } from "lucide-react";

// Renderização dos blocos de conteúdo (ver contrato em helpContent.js).
// `expandirFaq`: abre as perguntas durante uma busca, para o trecho encontrado
// ficar visível.
function Nota({ bloco }) {
  const destaque = bloco.tone === "destaque";
  return (
    <div
      role="note"
      className={`rounded-xl border border-l-4 bg-[#F0F6F8] px-3.5 py-2.5 text-[13px] leading-5 text-[#111111] ${destaque ? "border-[#AFC2CC] border-l-[#F38525]" : "border-[#AFC2CC] border-l-[#012E46]"}`}
    >
      {bloco.title && <p className="font-semibold text-[#012E46]">{bloco.title}</p>}
      <p className={bloco.title ? "mt-0.5" : ""}>{bloco.text}</p>
    </div>
  );
}

function Bloco({ bloco, expandirFaq }) {
  switch (bloco.type) {
    case "h":
      return <h4 className="pt-1 text-[13px] font-bold text-[#012E46]">{bloco.text}</h4>;
    case "list":
      return (
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-[#111111] marker:text-[#F38525]">
          {bloco.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-5 text-[#111111] marker:font-semibold marker:text-[#012E46]">
          {bloco.items.map((item) => <li key={item}>{item}</li>)}
        </ol>
      );
    case "terms":
      return (
        <dl className="divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
          {bloco.items.map((item) => (
            <div key={item.term} className="px-3 py-2.5">
              <dt className="text-[13px] font-semibold text-[#012E46]">{item.term}</dt>
              <dd className="mt-0.5 text-[13px] leading-5 text-[#111111]">{item.text}</dd>
            </div>
          ))}
        </dl>
      );
    case "note":
      return <Nota bloco={bloco} />;
    case "faq":
      return (
        <div className="space-y-2">
          {bloco.items.map((item) => (
            <details key={item.q} open={expandirFaq} className="group rounded-xl border border-[#E5E7EB] bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#012E46] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">{item.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="border-t border-[#E5E7EB] px-3 py-2.5 text-[13px] leading-5 text-[#111111]">{item.a}</p>
            </details>
          ))}
        </div>
      );
    default:
      return <p className="text-[13px] leading-5 text-[#111111]">{bloco.text}</p>;
  }
}

export default function HelpBlocks({ blocks, expandirFaq = false }) {
  return (
    <div className="space-y-3 break-words">
      {blocks.map((bloco, i) => <Bloco key={i} bloco={bloco} expandirFaq={expandirFaq} />)}
    </div>
  );
}
