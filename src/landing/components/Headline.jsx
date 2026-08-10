// Título de duas cores — "lead" em grafite neutro e "accent" em gradiente
// laranja→laranja profundo (mesmo tratamento já usado no H1 do Hero), com "tail"
// opcional em grafite após o trecho colorido. Centraliza o padrão que antes
// era escrito à mão (dois <span> por seção) num único componente.
export function Headline({ as: Tag = "h2", lead, accent, tail, className = "" }) {
  return (
    <Tag className={className}>
      {lead && <span className="block">{lead}</span>}
      {accent && (
        <span className="mt-1 block bg-gradient-to-r from-[#F38525] to-[#F38525] bg-clip-text text-transparent">
          {accent}
        </span>
      )}
      {tail && <span className="mt-1 block text-[var(--pp-graphite)]">{tail}</span>}
    </Tag>
  );
}
