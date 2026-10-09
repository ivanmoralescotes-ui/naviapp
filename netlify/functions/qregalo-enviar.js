"use strict";

const crypto = require("crypto");
const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = "qrpro-f4709";
const COLECCION = "whatsapp_mensajes";
const VENTANA_MS = 24 * 60 * 60 * 1000;
// Un margen pequeño evita intentar enviar justo al cerrar las 24 horas.
const MARGEN_MS = 2 * 60 * 1000;

function obtenerApp() {
  if (getApps().length) return getApp();

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("No se configuraron las credenciales de Firebase");
  const credenciales = JSON.parse(json);
  if (credenciales.private_key) {
    credenciales.private_key = credenciales.private_key.replace(/\\n/g, "\n");
  }

  return initializeApp({ credential: cert(credenciales), projectId: PROJECT_ID });
}

function respuesta(statusCode, datos) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(datos)
  };
}

function millisFecha(fecha) {
  if (fecha && typeof fecha.toMillis === "function") return fecha.toMillis();
  if (fecha instanceof Date) return fecha.getTime();
  return NaN;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respuesta(405, { error: "Método no permitido" });
  }

  const cabecera = event.headers?.authorization || event.headers?.Authorization || "";
  const coincidencia = cabecera.match(/^Bearer\s+(\S+)$/i);
  if (!coincidencia) return respuesta(401, { error: "Debes iniciar sesión" });
  if (!process.env.QREGALO_ADMIN_UID) {
    return respuesta(503, { error: "Administrador no configurado" });
  }

  let datos;
  try {
    datos = JSON.parse(event.body || "{}");
  } catch (_) {
    return respuesta(400, { error: "JSON inválido" });
  }

  const numero = String(datos.numeroCliente || "").trim();
  const texto = typeof datos.texto === "string" ? datos.texto.trim() : "";

  if (!/^\d{8,15}$/.test(numero)) {
    return respuesta(400, { error: "Número de WhatsApp inválido" });
  }
  if (!texto || texto.length > 4096) {
    return respuesta(400, { error: "El mensaje debe contener entre 1 y 4096 caracteres" });
  }

  try {
    const app = obtenerApp();
    let usuario;
    try {
      usuario = await getAuth(app).verifyIdToken(coincidencia[1]);
    } catch (_) {
      return respuesta(401, { error: "Sesión inválida o caducada" });
    }
    if (usuario.uid !== process.env.QREGALO_ADMIN_UID) {
      return respuesta(403, { error: "No tienes permiso para enviar mensajes" });
    }

    const db = getFirestore(app);

    // Solo se puede responder a números que ya nos escribieron.
    // Para esta primera versión, consultamos el historial del número;
    // más adelante optimizaremos esto con un documento por conversación.
    const historial = await db.collection(COLECCION)
      .where("numeroCliente", "==", numero)
      .get();

    let ultimaEntrada = -Infinity;
    historial.forEach((doc) => {
      const d = doc.data();
      if (d.direccion !== "entrante") return;
      const ms = millisFecha(d.fecha || d.fechaGuardado);
      if (Number.isFinite(ms)) ultimaEntrada = Math.max(ultimaEntrada, ms);
    });

    if (ultimaEntrada === -Infinity) {
      return respuesta(403, { error: "Este número todavía no tiene mensajes entrantes guardados" });
    }
    if (Date.now() - ultimaEntrada >= VENTANA_MS - MARGEN_MS) {
      return respuesta(409, {
        error: "La ventana de 24 horas terminó. El cliente debe escribir de nuevo o se necesita una plantilla aprobada por Meta."
      });
    }

    if (!process.env.META_ACCESS_TOKEN || !process.env.META_PHONE_NUMBER_ID) {
      return respuesta(503, { error: "Falta configurar la API de WhatsApp" });
    }

    const envio = await fetch(
      `https://graph.facebook.com/v24.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "text",
          text: { body: texto }
        })
      }
    );

    const resultadoTexto = await envio.text();
    let resultado = {};
    try { resultado = JSON.parse(resultadoTexto); } catch (_) { /* no JSON */ }

    if (!envio.ok) {
      console.error("QRegalo: Meta rechazó el envío", envio.status, resultado.error?.code);
      return respuesta(502, {
        error: resultado.error?.message || "Meta no pudo enviar el mensaje",
        codigoMeta: resultado.error?.code || null
      });
    }

    const idWhatsapp = resultado.messages?.[0]?.id || null;
    let guardado = false;
    try {
      const id = "out_" + crypto.createHash("sha256")
        .update(idWhatsapp || crypto.randomUUID())
        .digest("hex");

      await db.collection(COLECCION).doc(id).create({
        numeroCliente: numero,
        direccion: "saliente",
        tipo: "text",
        texto,
        idWhatsapp,
        fecha: new Date(),
        fechaGuardado: FieldValue.serverTimestamp(),
        origen: "panel_qregalo"
      });
      guardado = true;
    } catch (error) {
      // Ya fue enviado a WhatsApp: nunca repetirlo por un fallo de guardado.
      console.error("QRegalo: enviado pero no guardado en Firestore", error);
    }

    return respuesta(200, {
      success: true,
      guardado,
      idWhatsapp,
      aviso: guardado ? null : "WhatsApp lo envió, pero no se pudo guardar en Firebase. No lo reenvíes sin comprobar primero el chat."
    });
  } catch (error) {
    console.error("QRegalo: error enviando mensaje", error);
    return respuesta(500, { error: "Ocurrió un error al intentar enviar. Revisa el chat antes de reintentar." });
  }
};
