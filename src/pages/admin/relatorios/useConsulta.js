import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Consulta ao banco que refaz quando a chave muda. Resposta atrasada de um filtro antigo é descartada;
 * enquanto a nova não chega, a anterior continua na tela.
 */
export function useConsulta(consultar, chave) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  const [vez, setVez] = useState(0);
  const pedido = useRef(0);
  const funcao = useRef(consultar);
  useEffect(() => { funcao.current = consultar; });

  useEffect(() => {
    const meu = ++pedido.current;
    let vivo = true;
    (async () => {
      setEstado((e) => ({ ...e, carregando: true, erro: null }));
      try {
        const dados = await funcao.current();
        if (vivo && meu === pedido.current) setEstado({ dados, erro: null, carregando: false });
      } catch (erro) {
        if (vivo && meu === pedido.current) setEstado({ dados: null, erro, carregando: false });
      }
    })();
    return () => { vivo = false; };
  }, [chave, vez]);

  const atualizar = useCallback(() => setVez((v) => v + 1), []);
  return { ...estado, atualizar };
}
