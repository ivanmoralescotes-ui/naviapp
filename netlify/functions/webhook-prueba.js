"use strict";

const {
  bd, json, identificador, validarFirmaMeta, FieldValue,
  COLECCION, CONVERSACIONES, PENDIENTES, RETRASO_MS
} = require("../lib/qregalo-comun");

exports.handler = async (event) => {
  // La comprobación inicial de Meta sigue siendo compatible con la versión anterior.
  if (event.httpMethod === "GET") {
    const p = event.queryStringParameters || {};
    if (p["hub.mode"] === "subscribe" &&
        process.env.META_VERIFY_TOKEN &&
        p["hub.verify_token"] === process.env.META_VERIFY_TOKEN &&
        p["hub.challenge"] != null) {
      return { statusCode: 200, body: String(p["hub.challenge"]) };
    }
    return { statusCode: 403, body: "Verificación fallida" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido" };

  // Rechazar webhooks falsificados ANTES de procesar o guardar datos.
  const firma = validarFirmaMeta(event);
  if (!firma.ok) {
    console.error("QRegalo: webhook rechazado:", firma.reason || "firma incorrecta");
    return { statusCode: firma.reason === "Falta META_APP_SECRET" ? 503 : 403,
      body: "Solicitud no autenticada" };
  }

  let payload;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "{}");
    payload = JSON.parse(raw);
  } catch (_) { return json(400, { error: "JSON inválido" }); }

  try {
    const db = bd();
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const phoneId = value.metadata?.phone_number_id;
        if (phoneId && phoneId !== process.env.META_PHONE_NUMBER_ID) continue;

        // 'statuses' (entregado, leído, etc.) NO son mensajes de clientes.
        for (const mensaje of value.messages || []) {
          const numero = String(mensaje.from || "");
          if (!mensaje.id || !/^\d{8,15}$/.test(numero)) continue;

          const tipo = String(mensaje.type || "unknown");
          const texto = tipo === "text"
            ? (mensaje.text?.body || "")
            : (mensaje[tipo]?.caption || "");
          const id = identificador("in", mensaje.id);
          const msgRef = db.collection(COLECCION).doc(id);
          const convRef = db.collection(CONVERSACIONES).doc(numero);
          const pendRef = db.collection(PENDIENTES).doc(numero);
          const ahora = new Date();
          const recibida = Number.isFinite(Number(mensaje.timestamp))
            ? new Date(Number(mensaje.timestamp) * 1000)
            : ahora;

          // Una transacción preserva deduplicación y reprogramación del plazo.
          const nuevo = await db.runTransaction(async (t) => {
            const [yaExiste, convActual] = await Promise.all([
              t.get(msgRef), t.get(convRef)
            ]);
            if (yaExiste.exists) return false;

            const anterior = convActual.exists ? convActual.data() : {};
            const version = (Number(anterior.version) || 0) + 1;
            const habilitado = anterior.autoEnabled !== false;
            const venceEn = new Date(ahora.getTime() + RETRASO_MS);

            t.create(msgRef, {
              numeroCliente: numero, direccion: "entrante", tipo, texto,
              idWhatsapp: mensaje.id,
              mediaId: mensaje[tipo]?.id || null,
              mimeType: mensaje[tipo]?.mime_type || null,
              nombreArchivo: mensaje.document?.filename || null,
              fecha: recibida,
              fechaGuardado: FieldValue.serverTimestamp()
            });
            t.set(convRef, {
              numeroCliente: numero,
              autoEnabled: habilitado,
              version,
              ultimaEntradaFecha: recibida,
              ultimaEntradaId: mensaje.id,
              ultimaActividad: ahora,
              autoPendienteHasta: habilitado ? venceEn : null,
              errorAutomatico: null
            }, { merge: true });

            if (habilitado) {
              // Solo una respuesta pendiente por contacto; mensajes nuevos reinician 20 min.
              t.set(pendRef, {
                numeroCliente: numero, version, mensajeId: mensaje.id,
                estado: "pendiente", venceEn, fechaEntrada: recibida
              });
            } else {
              t.delete(pendRef);
            }
            return true;
          });

          if (nuevo) console.log("QRegalo: mensaje guardado; espera automática 20 min:", numero);
          else console.log("QRegalo: duplicado ignorado");
        }
      }
    }
  } catch (error) {
    console.error("QRegalo: fallo guardando webhook; Meta puede reintentar", error);
    return json(500, { error: "Error guardando el mensaje" });
  }

  return { statusCode: 200, body: "OK" };
};
