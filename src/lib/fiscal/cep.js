// ════════════════════════════════════════════════════════════
//  Endereço pelo CEP (ViaCEP — serviço público gratuito), para o
//  destinatário da NF-e (E8 parte 3). Só o CEP sai do navegador.
//  Devolve também o código IBGE do município (exigido no XML: cMun).
// ════════════════════════════════════════════════════════════

export async function buscarEnderecoPorCep(cep, { fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const c = String(cep ?? "").replace(/\D/g, "");
  if (c.length !== 8) return { ok: false, erro: "CEP deve ter 8 dígitos." };
  let r;
  try {
    const resp = await fetchFn(`https://viacep.com.br/ws/${c}/json/`, { headers: { accept: "application/json" } });
    if (!resp.ok) return { ok: false, erro: "Não foi possível consultar o CEP agora. Preencha à mão." };
    r = await resp.json();
  } catch {
    return { ok: false, erro: "Sem conexão para consultar o CEP. Preencha à mão." };
  }
  if (!r || r.erro) return { ok: false, erro: "CEP não encontrado." };
  const ibge = String(r.ibge || "").replace(/\D/g, "");
  return {
    ok: true,
    ender: {
      CEP: c, xLgr: String(r.logradouro || ""), xBairro: String(r.bairro || ""), xMun: String(r.localidade || ""),
      UF: String(r.uf || "").toUpperCase(), cMun: /^[0-9]{7}$/.test(ibge) ? ibge : "",
    },
  };
}
