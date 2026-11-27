import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { vigiarSessaoAuth } from "../lib/sessaoAuth.js";

/**
 * Avisa quando a sessão do Supabase Auth deixa de existir com o usuário na tela.
 *
 * @param {object|null} currentUser
 * @param {{
 *   ativo: boolean,
 *   aoPerder: () => (void|Promise<void>),
 *   suprimir?: () => boolean,
 * }} options
 */
export function useSessaoAuthPerdida(currentUser, options) {
  const aoPerderRef = useRef(options.aoPerder);
  const suprimirRef = useRef(options.suprimir);
  useEffect(() => {
    aoPerderRef.current = options.aoPerder;
    suprimirRef.current = options.suprimir;
  });

  useEffect(() => {
    if (!options.ativo || !currentUser?.id) return undefined;
    return vigiarSessaoAuth({
      auth: supabase.auth,
      aoPerder: () => aoPerderRef.current(),
      suprimir: () => !!suprimirRef.current?.(),
    });
  }, [options.ativo, currentUser?.id]);
}
