// @vitest-environment node
// Contrato banco × servidor fiscal: os campos que o servidor lê precisam
// existir na ÚLTIMA versão de cada função do banco (migrations em ordem).
// Criado após a simulação ponta a ponta de 16/11/2026: a 180 não devolvia
// pedidos_ids/valor_total e os testes com documento "de mentira" não viram.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../../supabase/migrations/", import.meta.url);
const migrations = readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();

function ultimaVersao(funcao) {
  let corpo = null, arquivo = null;
  for (const f of migrations) {
    const s = readFileSync(new URL(f, DIR), "utf8").replace(/\r\n/g, "\n");
    const re = new RegExp(`create or replace function public\\.${funcao}\\([\\s\\S]*?\\n\\$\\$;`, "g");
    for (const m of s.matchAll(re)) { corpo = m[0]; arquivo = f; }
  }
  return { corpo, arquivo };
}

const CONTRATO = {
  // documento → emissaoService / dadosDaVenda.conferirVenda / contingência
  app_fiscal_documento_para_emissao: ["'id'", "'loja_id'", "'modelo'", "'serie'", "'numero'", "'ambiente'", "'status'", "'chave'", "'rascunho'", "'tp_emis'", "'contingencia_documento_id'", "'pedidos_ids'", "'valor_total'"],
  // pedidos → dadosDaVenda.conferirVenda / somaItensPedidos
  app_fiscal_pedidos_do_documento: ["'id'", "'loja_id'", "'status'", "'status_pagamento'", "'itens'"],
  // emitente/CNPJ → dadosDaVenda / credencial
  app_fiscal_loja_servidor: ["'documento'", "'emitente'"],
  // DANFE → ação danfe
  app_fiscal_documento_para_danfe: ["'fonte'", "'xml'", "'loja_id'", "'modelo'", "'tp_emis'", "'epec_protocolo'", "'epec_dh_registro'"],
  // contingência → transmitir/EPEC
  app_fiscal_contingencia_para_transmitir: ["'xml_assinado'", "'tp_emis'", "'epec_protocolo'"],
};

describe("contrato banco × servidor fiscal", () => {
  for (const [funcao, campos] of Object.entries(CONTRATO)) {
    it(`${funcao} devolve o que o servidor usa`, () => {
      const { corpo, arquivo } = ultimaVersao(funcao);
      expect(corpo, `função ${funcao} não encontrada nas migrations`).toBeTruthy();
      for (const c of campos) expect(corpo, `${funcao} (${arquivo}) sem ${c}`).toContain(c);
    });
  }
});
