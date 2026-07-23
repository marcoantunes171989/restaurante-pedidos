import { useCallback, useEffect, useRef, useState } from "react";
import { avaliarStatus, detectarPlataforma, ehStandalone, lerInstalacaoPersistida, registrarInstalacaoPersistida } from "./pwaDetection";

// ════════════════════════════════════════════════════════════
//  usePwaEnvironment — única fonte de verdade sobre o ambiente PWA.
//  Escuta os eventos reais do navegador (beforeinstallprompt,
//  appinstalled, mudança de display-mode) e chama
//  navigator.getInstalledRelatedApps() quando disponível; toda a
//  DECISÃO de qual status resulta disso é delegada a avaliarStatus()
//  (pwaDetection.js — função pura, testável isolada).
//
//  Não roda nada no SSR: window/navigator só são tocados dentro de
//  useEffect (nunca no corpo do componente/hook), que só executa no
//  cliente, após a montagem.
// ════════════════════════════════════════════════════════════
export function usePwaEnvironment() {
  const [status, setStatus] = useState("checking");
  const [standalone, setStandalone] = useState(false);
  const [apiInstalado, setApiInstalado] = useState(null); // null = ainda não respondeu / API indisponível
  const [apiDisponivel, setApiDisponivel] = useState(false);
  const [temPromptNativo, setTemPromptNativo] = useState(false);
  const [recemInstalado, setRecemInstalado] = useState(false);
  const [persistedInstalled, setPersistedInstalled] = useState(false); // localStorage — sinal ADICIONAL, nunca o único (ver pwaDetection.js)
  const [plataforma, setPlataforma] = useState({ so: "outro", navegador: "outro" });
  const deferredRef = useRef(null);

  // Plataforma (só pra textos) + estado inicial de standalone — únicos
  // acessos a navigator fora de useEffect, mas ainda assim protegidos:
  // usePwaEnvironment só é chamado depois da montagem no cliente
  // (PwaExperienceProvider é um Client Component renderizado normal,
  // nunca durante SSR — este projeto nem usa SSR, é Vite+SPA puro).
  useEffect(() => {
    queueMicrotask(() => {
      setPlataforma(detectarPlataforma());
      setStandalone(ehStandalone());
      setPersistedInstalled(lerInstalacaoPersistida());
    });
  }, []);

  // display-mode: reavalia "standalone" sempre que mudar (ex.: usuário
  // instalou e o navegador reconhece o app rodando em outra janela, ou
  // — mais raro — a mesma aba muda de contexto).
  useEffect(() => {
    const queries = ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)", "(display-mode: window-controls-overlay)"];
    const mqls = queries.map((q) => { try { return window.matchMedia(q); } catch { return null; } }).filter(Boolean);
    const onChange = () => setStandalone(ehStandalone());
    mqls.forEach((mql) => mql.addEventListener("change", onChange));
    return () => mqls.forEach((mql) => mql.removeEventListener("change", onChange));
  }, []);

  // Confirmação persistida: sempre que a aplicação estiver de fato rodando
  // standalone, registra isso em localStorage — é o sinal que permite
  // reconhecer "já instalado" numa visita FUTURA pelo navegador comum,
  // mesmo quando getInstalledRelatedApps() está indisponível ou não
  // confirma (ver pwaDetection.js). Nunca é o único sinal usado.
  useEffect(() => {
    if (standalone) registrarInstalacaoPersistida();
  }, [standalone]);

  // beforeinstallprompt + appinstalled — capturados uma única vez;
  // preventDefault() sempre, prompt() só é chamado depois de clique
  // real do usuário (ver promptInstalar abaixo).
  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      setTemPromptNativo(true);
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setTemPromptNativo(false);
      setApiInstalado(true);
      setRecemInstalado(true);
      registrarInstalacaoPersistida();
      setPersistedInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // getInstalledRelatedApps() — Chrome/Edge (Windows/Android/Mac). O
  // manifest já declara related_applications apontando pro próprio
  // manifest (platform "webapp"), condição exigida pela API pra
  // reconhecer ESTE PWA como instalado (ver public/manifest.webmanifest).
  useEffect(() => {
    if (!("getInstalledRelatedApps" in navigator)) { queueMicrotask(() => setApiDisponivel(false)); return; }
    queueMicrotask(() => setApiDisponivel(true));
    let cancelado = false;
    navigator.getInstalledRelatedApps()
      .then((apps) => {
        if (cancelado) return;
        const instalado = Array.isArray(apps) && apps.some((a) => a.platform === "webapp");
        setApiInstalado(instalado);
      })
      .catch(() => { if (!cancelado) setApiInstalado(null); });
    return () => { cancelado = true; };
  }, []);

  // Recalcula o status sempre que qualquer sinal mudar — queueMicrotask
  // evita o setState ser tratado como "síncrono dentro do efeito"
  // (mesmo idiom já usado em NotificationSettings.jsx/useAnchoredPosition.js).
  useEffect(() => {
    queueMicrotask(() => {
      setStatus(avaliarStatus({ standalone, apiInstalado, apiDisponivel, temPromptNativo, so: plataforma.so, persistedInstalled }));
    });
  }, [standalone, apiInstalado, apiDisponivel, temPromptNativo, plataforma.so, persistedInstalled]);

  // Chamado só a partir de um clique real do usuário — nunca automaticamente.
  const promptInstalar = useCallback(async () => {
    const evt = deferredRef.current;
    if (!evt) return { outcome: "unavailable" };
    deferredRef.current = null;
    setTemPromptNativo(false);
    try {
      evt.prompt();
      const escolha = await evt.userChoice;
      if (escolha?.outcome === "accepted") setApiInstalado(true);
      return escolha;
    } catch {
      return { outcome: "dismissed" };
    }
  }, []);

  return { status, so: plataforma.so, navegador: plataforma.navegador, temPromptNativo, recemInstalado, promptInstalar };
}
