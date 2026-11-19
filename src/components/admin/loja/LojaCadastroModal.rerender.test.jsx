// @vitest-environment jsdom
// Reproduz o comportamento do App real: o objeto `emitenteApi` é RECRIADO a cada renderização do pai
// (como em `const emitenteFiscalApi = {...}` dentro do App). O formulário não pode perder o que o usuário
// digitou, nem o que a busca pelo CNPJ preencheu, quando o pai re-renderiza.
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase", () => ({ validarImagemProduto: () => null, uploadImagemProduto: async () => "" }));
import LojaCadastroModal from "./LojaCadastroModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = container = null;
});
const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function digitar(id, valor) {
  const el = container.querySelector(`#${id}`);
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function aba(id) { await act(async () => { container.querySelector(`#tab-${id}`).click(); }); }
const valorDe = (id) => container.querySelector(`#${id}`)?.value;

const LOJA = { id: 9, nome: "Burger Station", prefixo: "HAM", documento: "", modoUso: "interno" };
// Formato REAL devolvido por dbParaEmitente: todas as chaves, com "" nas que não têm dado.
const NO_BANCO = {
  id: 1, lojaId: 9, razaoSocial: "", nomeFantasia: "", inscricaoEstadual: "110042490114", inscricaoMunicipal: "", crt: "1", cnaePrincipal: "",
  cep: "01001000", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", codigoMunicipioIbge: "", uf: "SP",
  telefoneFiscal: "", emailFiscal: "", nfceAmbiente: "simulacao", nfceSerie: 1, segmento: "", nfceHabilitada: true, nfeHabilitada: false,
};
const RECEITA = { ok: true, dados: { campos: { razaoSocial: "BURGER STATION ALIMENTOS LTDA", nomeFantasia: "BURGER STATION", cnaePrincipal: "5611203", segmento: "", crt: "1", cep: "01001000", uf: "SP",
  logradouro: "RUA DAS FLORES", numero: "100", complemento: "", bairro: "CENTRO", municipio: "SAO PAULO", codigoMunicipioIbge: "3550308", telefoneFiscal: "1133334444", emailFiscal: "" },
  nome: "Burger Station", situacao: { descricao: "ATIVA", ativa: true }, avisos: [] } };

// Pai que se comporta como o App: a cada render cria um objeto novo de API e re-renderiza quando algo muda.
let forcarRender;
let buscasNoBanco = 0;
function PaiComoApp({ consultaCnpj, salvarOperacional }) {
  const [, setN] = useState(0);
  useEffect(() => { forcarRender = () => setN((n) => n + 1); }, []);
  const api = { fetch: async () => { buscasNoBanco += 1; return NO_BANCO; }, salvar: async (_i, d) => d, salvarIdentidade: async () => true };
  return <LojaCadastroModal mode="edit" loja={LOJA} emitenteApi={api} operacaoEditavel={false} consultaCnpj={consultaCnpj}
    onSalvarOperacional={salvarOperacional || (async () => {})} onFechar={() => {}} />;
}
function montar(props = {}) {
  buscasNoBanco = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PaiComoApp {...props} />));
}

describe("O formulário não perde dados quando o pai (App) re-renderiza", () => {
  it("o que o usuário digitou continua lá depois de várias renderizações do App", async () => {
    montar();
    await esperar(30);
    await digitar("lc-razao", "Burger Station Ltda");
    await act(async () => { forcarRender(); });
    await esperar(30);
    await act(async () => { forcarRender(); });
    await esperar(30);
    expect(valorDe("lc-razao")).toBe("Burger Station Ltda");
  });
  it("o que a busca pelo CNPJ preencheu continua lá depois de o App re-renderizar", async () => {
    montar({ consultaCnpj: async () => RECEITA });
    await esperar(30);
    await digitar("lc-doc", "11222333000181");
    await esperar(30);
    expect(valorDe("lc-razao")).toBe("BURGER STATION ALIMENTOS LTDA");
    await act(async () => { forcarRender(); });
    await esperar(30);
    expect(valorDe("lc-razao")).toBe("BURGER STATION ALIMENTOS LTDA");
    await aba("endereco");
    expect(valorDe("lc-log")).toBe("RUA DAS FLORES");
    expect(valorDe("lc-ibge")).toBe("3550308");
  });
  it("o cadastro é lido do banco UMA vez ao abrir, não a cada renderização do App", async () => {
    montar();
    await esperar(30);
    for (let i = 0; i < 4; i += 1) { await act(async () => { forcarRender(); }); await esperar(10); }
    expect(buscasNoBanco).toBe(1);
  });
});

describe("Falha ao gravar os dados da empresa não passa em silêncio", () => {
  async function salvar() {
    const btn = [...container.querySelectorAll("button")].find((b) => /Salvar altera/.test(b.textContent));
    await act(async () => { btn.click(); });
    await esperar(20);
  }
  it("se a gravação da identidade (nome/CNPJ) devolve false, o formulário NÃO fecha, NÃO grava o fiscal e explica", async () => {
    const fechou = vi.fn();
    const salvouFiscal = vi.fn(async (_i, d) => d);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const api = { fetch: async () => NO_BANCO, salvar: salvouFiscal };
    act(() => root.render(<LojaCadastroModal mode="edit" loja={LOJA} emitenteApi={api} operacaoEditavel={false}
      onSalvarOperacional={async () => false} onFechar={fechou} />));
    await esperar(30);
    await salvar();
    expect(fechou).not.toHaveBeenCalled();
    expect(salvouFiscal).not.toHaveBeenCalled();
    expect(container.textContent).toContain("não foram salvos");
  });
  it("quando a identidade grava (true ou sem retorno), segue e grava o fiscal normalmente", async () => {
    for (const retorno of [true, undefined]) {
      const fechou = vi.fn();
      const salvouFiscal = vi.fn(async (_i, d) => d);
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => root.render(<LojaCadastroModal mode="edit" loja={LOJA} emitenteApi={{ fetch: async () => NO_BANCO, salvar: salvouFiscal }} operacaoEditavel={false}
        onSalvarOperacional={async () => retorno} onFechar={fechou} />));
      await esperar(30);
      await salvar();
      expect(salvouFiscal).toHaveBeenCalledTimes(1);
      expect(fechou).toHaveBeenCalledTimes(1);
      act(() => root.unmount());
      container.remove();
      root = container = null;
    }
  });
});
