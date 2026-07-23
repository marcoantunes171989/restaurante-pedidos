import { supabase } from "./supabase";

// Grava um lead da landing page via RPC pública (security definer) —
// mesmo padrão de pub_criar_pedido/pub_pesquisa_satisfacao: nunca INSERT
// direto de anon na tabela, sempre por função no banco (ver
// supabase/migrations/072_leads.sql).
export async function criarLead({ nome, estabelecimento, whatsapp, email, mesas }) {
  const { error } = await supabase.rpc("pub_criar_lead", {
    p_nome: nome.trim(),
    p_nome_estabelecimento: estabelecimento.trim(),
    p_whatsapp: whatsapp.replace(/\D/g, ""),
    p_email: email?.trim() || null,
    p_numero_mesas: mesas ? Number(mesas) : null,
    p_origem: "landing",
  });
  if (error) throw new Error("Não foi possível enviar seus dados agora. Tente novamente em instantes.");
}
