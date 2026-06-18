// ════════════════════════════════════════════════════════════
//  Migração de usuários: tab_usuarios → Supabase Auth
//  Cria (ou ignora se já existir) um usuário no Supabase Auth para
//  cada linha de tab_usuarios, com o MESMO e-mail e senha. O hook
//  (migration 047) vincula o loja_id no JWT pelo e-mail.
//
//  Requer a SERVICE ROLE KEY (NUNCA exponha no front-end). Rode local:
//    SUPABASE_URL="https://SEU-PROJ.supabase.co" \
//    SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
//    node scripts/criar-auth-users.mjs
//
//  É IDEMPOTENTE: rodar de novo só cria os que faltam.
//  Dica: rode primeiro numa BRANCH do Supabase para validar.
// ════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Carrega scripts/.env (NÃO versionado) se existir — facilita rodar sem mexer no shell.
(() => {
  try {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(join(aqui, ".env"), "utf8");
    for (const linha of txt.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sem arquivo .env — usa o ambiente */ }
})();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (em scripts/.env ou no ambiente).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Lista todos os e-mails já existentes no Auth (paginado)
async function emailsExistentes() {
  const set = new Set();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    (data?.users || []).forEach((u) => u.email && set.add(u.email.toLowerCase()));
    if (!data?.users?.length || data.users.length < 1000) break;
    page += 1;
  }
  return set;
}

async function main() {
  const { data: usuarios, error } = await admin.from("tab_usuarios").select("id,nome,email,senha,super_admin,loja_id");
  if (error) throw error;
  const jaTem = await emailsExistentes();

  let criados = 0, pulados = 0, falhas = 0;
  for (const u of usuarios || []) {
    const email = (u.email || "").trim();
    if (!email) { pulados++; continue; }
    if (jaTem.has(email.toLowerCase())) { pulados++; continue; }
    const senha = (u.senha || "").length >= 6 ? u.senha : `${u.senha || "mudar"}__pp`; // Auth exige >= 6
    const { error: e } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: u.nome, loja_id: u.loja_id, super_admin: !!u.super_admin },
    });
    if (e) { console.warn(`✗ ${email}: ${e.message}`); falhas++; }
    else { console.log(`✓ ${email}${senha !== u.senha ? " (senha ajustada p/ mínimo 6)" : ""}`); criados++; }
  }
  console.log(`\nResumo: ${criados} criado(s), ${pulados} já existente(s)/sem e-mail, ${falhas} falha(s).`);
  if (falhas) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
