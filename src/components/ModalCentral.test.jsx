// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import ModalCentral from "./ModalCentral.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

function Telas() {
  const [perfil, setPerfil] = useState(true);
  const [cupom, setCupom] = useState(false);
  const [envio, setEnvio] = useState(false);
  return (
    <>
      {perfil && (
        <ModalCentral ariaLabel="Perfil" titulo="Perfil" onFechar={() => setPerfil(false)}>
          <button onClick={() => setCupom(true)}>Ver cupom</button>
        </ModalCentral>
      )}
      {cupom && (
        <ModalCentral ariaLabel="Cupom" titulo="Cupom" onFechar={() => setCupom(false)}>
          <button onClick={() => { setCupom(false); setEnvio(true); }}>Enviar</button>
        </ModalCentral>
      )}
      {envio && <ModalCentral ariaLabel="Envio" titulo="Envio" onFechar={() => setEnvio(false)}>conteúdo</ModalCentral>}
    </>
  );
}

function abrirTelas() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Telas />));
}

const janela = (nome) => document.querySelector(`[role="dialog"][aria-label="${nome}"]`);
const botao = (texto) => [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent).trim() === texto);
const clicar = (texto) => act(() => { botao(texto).click(); });
const teclaEsc = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });

describe("janela central", () => {
  it("a subtela abre dentro da janela anterior, com Voltar", () => {
    abrirTelas();
    clicar("Ver cupom");
    expect(janela("Perfil").contains(janela("Cupom"))).toBe(true);
    clicar("Voltar");
    expect(janela("Cupom")).toBeNull();
    expect(janela("Perfil")).not.toBeNull();
  });

  it("Esc fecha só a janela do topo", () => {
    abrirTelas();
    clicar("Ver cupom");
    teclaEsc();
    expect(janela("Cupom")).toBeNull();
    expect(janela("Perfil")).not.toBeNull();
    teclaEsc();
    expect(janela("Perfil")).toBeNull();
  });

  it("fechar uma e abrir outra no mesmo clique mantém a nova visível dentro da primeira", () => {
    abrirTelas();
    clicar("Ver cupom");
    clicar("Enviar");
    expect(janela("Cupom")).toBeNull();
    expect(janela("Envio")).not.toBeNull();
    expect(janela("Perfil").contains(janela("Envio"))).toBe(true);
  });

  it("fechar a janela de baixo fecha também a que está dentro", () => {
    abrirTelas();
    clicar("Ver cupom");
    clicar("Fechar"); // o primeiro "Fechar" da página é o da janela de baixo
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });
});
