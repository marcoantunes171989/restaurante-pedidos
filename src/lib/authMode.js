// ════════════════════════════════════════════════════════════
//  Modo de autenticação — flag de transição para Supabase Auth + RLS
//
//  AUTH_MODE = 'legacy'   → comportamento ATUAL (login compara contra
//                           tab_usuarios com a chave anon). Padrão.
//  AUTH_MODE = 'supabase' → login via Supabase Auth (JWT por usuário),
//                           pré-requisito para a RLS real por loja_id.
//
//  ENQUANTO ESTIVER 'legacy', NADA muda no app. Só troque para
//  'supabase' depois de:
//    1) aplicar a migration 047 (hook de claim loja_id no JWT) e
//       registrar o hook em Auth → Hooks no Supabase;
//    2) ter criado os usuários no Supabase Auth (ver docs/RLS_AUTH_MIGRACAO.md);
//    3) testar o login numa BRANCH do Supabase.
//  A RLS restritiva (migration 048) só deve ser aplicada após o login
//  'supabase' estar 100% validado. Rollback: migration 049 + voltar a flag.
// ════════════════════════════════════════════════════════════
export const AUTH_MODE = "supabase"; // 'legacy' | 'supabase'

export const usandoSupabaseAuth = () => AUTH_MODE === "supabase";

// Cardápio público via RPC (necessário quando a RLS estrita estiver ligada —
// migration 048). DESLIGADO por padrão: até lá o /cardapio usa o acesso direto
// atual (que continua funcionando no modo permissivo). Ligue junto com o enforce.
export const CARDAPIO_PUBLICO_VIA_RPC = true;
export const cardapioViaRpc = () => CARDAPIO_PUBLICO_VIA_RPC === true;
