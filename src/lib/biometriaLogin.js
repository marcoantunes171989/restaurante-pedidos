// ════════════════════════════════════════════════════════════
//  Login com biometria (digital/rosto) — SOMENTE no dispositivo, via
//  WebAuthn com autenticador de PLATAFORMA (Touch ID/Face ID no iOS/Mac,
//  impressão digital/reconhecimento facial no Android, Windows Hello).
//
//  Isto NÃO é um segundo fator verificado pelo servidor (não há migration
//  nem API nova): é um "cadeado local" — o sistema operacional confirma a
//  biometria da pessoa dona do aparelho e, só então, o app libera o
//  e-mail/senha já lembrados neste dispositivo (ver lembrarLogin.js) e
//  envia o login de sempre. A autenticação de verdade continua 100% no
//  servidor (e-mail + senha); a biometria troca é só a DIGITAÇÃO manual.
//  Por isso o cadastro de biometria só faz sentido (e só é oferecido)
//  quando já existe e-mail/senha lembrados neste aparelho.
// ════════════════════════════════════════════════════════════
const CHAVE_CREDENCIAL = "pedido-prime:biometria-credencial";
const CHAVE_RECUSADA = "pedido-prime:biometria-recusada";

function paraBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let i = 0; i < bytes.byteLength; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto) {
  const pad = (4 - (texto.length % 4)) % 4;
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

export async function biometriaDisponivel() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function lerCredencialBiometrica() {
  try {
    const bruto = localStorage.getItem(CHAVE_CREDENCIAL);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados.credentialId !== "string" || typeof dados.email !== "string") return null;
    return dados;
  } catch {
    return null;
  }
}

export function biometriaFoiRecusada() {
  try { return localStorage.getItem(CHAVE_RECUSADA) === "1"; } catch { return false; }
}

export function marcarBiometriaRecusada() {
  try { localStorage.setItem(CHAVE_RECUSADA, "1"); } catch { /* ignore */ }
}

export function limparBiometria() {
  try { localStorage.removeItem(CHAVE_CREDENCIAL); } catch { /* ignore */ }
}

/**
 * Pede o cadastro da biometria do sistema (prompt nativo do SO) e guarda
 * só o id da credencial criada — nenhum dado biométrico chega ao app nem
 * ao servidor, isso é tratado inteiramente pelo sistema operacional.
 */
export async function registrarBiometria(email) {
  const desafio = new Uint8Array(32);
  crypto.getRandomValues(desafio);
  const idUsuario = new Uint8Array(16);
  crypto.getRandomValues(idUsuario);
  const credencial = await navigator.credentials.create({
    publicKey: {
      challenge: desafio,
      rp: { name: "Pedido Prime" },
      user: { id: idUsuario, name: email, displayName: email },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!credencial) throw new Error("Cadastro de biometria cancelado.");
  const credentialId = paraBase64Url(credencial.rawId);
  try { localStorage.setItem(CHAVE_CREDENCIAL, JSON.stringify({ credentialId, email })); } catch { /* ignore */ }
  try { localStorage.removeItem(CHAVE_RECUSADA); } catch { /* ignore */ }
  return credentialId;
}

/** Pede a biometria já cadastrada (prompt nativo). true = reconhecida pelo SO. */
export async function confirmarBiometria(credentialId) {
  const desafio = new Uint8Array(32);
  crypto.getRandomValues(desafio);
  try {
    const resultado = await navigator.credentials.get({
      publicKey: {
        challenge: desafio,
        allowCredentials: [{ id: deBase64Url(credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!resultado;
  } catch {
    return false;
  }
}
