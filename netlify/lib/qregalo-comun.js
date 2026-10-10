"use strict";

const crypto = require("node:crypto");
const { getApps, getApp, initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "qrpro-f4709";
const COLECCION = "whatsapp_mensajes";
const CONVERSACIONES = "qregalo_conversaciones";
const PENDIENTES = "qregalo_pendientes";
const RETRASO_MS = 19 * 60 * 1000;
const INTERVALO_SESION_MS = 60 * 60 * 1000;
const VENTANA_MS = 24 * 60 * 60 * 1000;
const MARGEN_MS = 2 * 60 * 1000;
const TEXTO_AUTO = "¡Hola! 😊 Estamos revisando tu mensaje. Te responderemos lo antes posible.";

function appFirebase() {
  const existente = getApps().find((a) => a.name === "qregalo");
  if (existente) return existente;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON");
  const credenciales = JSON.parse(json);
  if (credenciales.private_key) {
    credenciales.private_key = credenciales.private_key.replace(/\\n/g, "\n");
  }
  return initializeApp({ credential: cert(credenciales), projectId: PROJECT_ID }, "qregalo");
}

function bd() { return getFirestore(appFirebase()); }

function json(statusCode, datos) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(datos)
  };
}

async function verificarAdmin(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const coincide = auth.match(/^Bearer\s+(\S+)$/i);
  if (!coincide) return { status: 401, error: "Debes iniciar sesión" };
  if (!process.env.QREGALO_ADMIN_UID) {
    return { status: 503, error: "Administrador no configurado" };
  }
  let usuario;
  try {
    usuario = await getAuth(appFirebase()).verifyIdToken(coincide[1]);
  } catch (_) {
    return { status: 401, error: "Sesión inválida o caducada" };
  }
  if (usuario.uid !== process.env.QREGALO_ADMIN_UID) {
    return { status: 403, error: "No tienes permiso para acceder" };
  }
  return { usuario };
}

function fechaMs(valor) {
  if (valor && typeof valor.toMillis === "function") return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "number") return valor;
  return NaN;
}
function fechaIso(valor) {
  const ms = fechaMs(valor);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function identificador(prefijo, valor) {
  return prefijo + "_" + crypto.createHash("sha256").update(String(valor)).digest("hex");
}
function validaNumero(numero) { return /^\d{8,15}$/.test(numero); }

function validarFirmaMeta(event) {
  const secreto = process.env.META_APP_SECRET;
  if (!secreto) return { ok: false, reason: "Falta META_APP_SECRET" };
  const cabeceras = event.headers || {};
  const firma = cabeceras["x-hub-signature-256"] || cabeceras["X-Hub-Signature-256"];
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(String(firma || ""))) {
    return { ok: false, reason: "Firma ausente o inválida" };
  }
  const cuerpo = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpo).digest();
  const recibida = Buffer.from(String(firma).slice(7), "hex");
  return { ok: recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada) };
}

async function enviarMeta(numero, texto, { signal } = {}) {
  if (!process.env.META_PHONE_NUMBER_ID || !process.env.META_ACCESS_TOKEN) {
    throw new Error("Falta la configuración META_ACCESS_TOKEN / META_PHONE_NUMBER_ID");
  }
  const respuesta = await fetch(
    `https://graph.facebook.com/v24.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: numero,
        type: "text", text: { body: texto }
      })
    }
  );
  const cuerpo = await respuesta.text();
  let datos = {};
  try { datos = JSON.parse(cuerpo); } catch (_) { /* respuesta no JSON */ }
  return { ok: respuesta.ok, status: respuesta.status, datos, idWhatsapp: datos.messages?.[0]?.id || null };
}

module.exports = {
  bd, json, verificarAdmin, fechaIso, fechaMs, identificador,
  validaNumero, validarFirmaMeta, enviarMeta, FieldValue,
  COLECCION, CONVERSACIONES, PENDIENTES, RETRASO_MS, INTERVALO_SESION_MS,
  VENTANA_MS, MARGEN_MS, TEXTO_AUTO
};
