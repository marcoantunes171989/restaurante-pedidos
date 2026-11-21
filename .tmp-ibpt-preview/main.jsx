import { createRoot } from "react-dom/client";
import "../src/index.css";
import TabelaIbptConfig from "../src/components/admin/fiscal/TabelaIbptConfig.jsx";
const cenario = new URLSearchParams(location.search).get("c") || "sem";
const tabelas = cenario === "vencida"
  ? [{ uf: "SP", versao: "24.2.B", chave: "19CB11", vigenciaInicio: "2024-08-20", vigenciaFim: "2024-09-30", qtdNcm: 10458, importadoEm: "2024-09-01T12:00:00Z" }]
  : cenario === "vigente"
  ? [{ uf: "SP", versao: "26.2.A", chave: "ABC123", vigenciaInicio: "2026-07-01", vigenciaFim: "2027-03-31", qtdNcm: 10458, importadoEm: "2026-11-19T12:00:00Z" }]
  : [];
const supabase = { rpc: async (nome) => ({ error: null, data:
  nome === "app_fiscal_ibpt_resumo" ? { ok: true, ufLoja: "SP", ehSuper: false, tabelas } :
  nome === "app_fiscal_emitente_da_loja" ? { ok: true, emitente: { uf: "SP" } } : { ok: true } }) };
createRoot(document.getElementById("root")).render(<TabelaIbptConfig supabase={supabase} lojaInfo={{ id: 7 }} />);
