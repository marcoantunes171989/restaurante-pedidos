// @vitest-environment jsdom
//
// Associação inicial da mesa do tablet deve ser fail-closed (migration 125 /
// registrarDispositivo agora é uma RPC que pode rejeitar — ex.: HTTP 403 real
// observado em HML antes desta correção). Antes, onConfirmar era chamado sem
// await e o erro do heartbeat era engolido em App.jsx: a UI avançava para o
// cardápio mesmo quando NADA foi persistido no servidor. Este teste comprova,
// no nível do componente que efetivamente decide "avançar ou não", que:
//   1) sucesso do RPC → avança (mostra estado de sucesso).
//   2) falha do RPC → NÃO avança, mostra erro amigável, permanece na seleção.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabletTableAccess from "./TabletTableAccess";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;

async function renderTela(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TabletTableAccess
        lojaInfo={null}
        mesas={[]}
        mesasOcupadasPorDispositivo={new Set()}
        mesasComPedidoAberto={new Set()}
        tableNumber=""
        mesaManual={props.mesaManual ?? "3"}
        setMesaManual={props.setMesaManual ?? (() => {})}
        {...props}
      />,
    );
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("TabletTableAccess — associação inicial de mesa (fail-closed)", () => {
  it("associação com sucesso permite continuar (mostra confirmação)", async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    const el = await renderTela({ onConfirmar });

    const botao = el.querySelector("button.btn-laranja");
    await act(async () => {
      botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // aguarda a resolução da promise interna de confirmarManual()
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmar).toHaveBeenCalledWith("3");
    expect(el.textContent).toContain("Tablet configurado com sucesso");
  });

  it("associação que falha no servidor NÃO avança — mostra erro e permanece na seleção", async () => {
    const onConfirmar = vi.fn().mockRejectedValue(new Error("permission denied for table tab_dispositivos"));
    const el = await renderTela({ onConfirmar });

    const botao = el.querySelector("button.btn-laranja");
    await act(async () => {
      botao.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onConfirmar).toHaveBeenCalledWith("3");
    expect(el.textContent).not.toContain("Tablet configurado com sucesso");
    expect(el.textContent).toContain("Não foi possível configurar este tablet agora");
    // continua na tela de seleção manual, pronta para nova tentativa
    expect(el.querySelector('input[inputmode="numeric"]')).toBeTruthy();
  });
});
