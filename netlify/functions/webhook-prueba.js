"use strict";

const {
  bd, json, identificador, validarFirmaMeta, fechaMs, enviarMeta, FieldValue,
  COLECCION, CONVERSACIONES, PENDIENTES, RETRASO_MS
} = require("../lib/qregalo-comun");

// Notificar al administrador como máximo una vez cada 60 minutos por cliente.
// Este número debe haber escrito al negocio durante las últimas 24 horas para
// que Meta permita enviarle mensajes de texto sin plantilla.
const WHATSAPP_PERSONAL = "573006291217";
const MENSAJE_AVISO = "Escribieron. Puedes ir a https://ú.ws/qregalo-chat.html";
const INTERVALO_AVISOS_MS = 60 * 60 * 1000;
const TIEMPO_MAXIMO_AVISO_MS = 6000;

async function enviarAvisoNoCritico(numeroCliente) {
  try {
    const resultado = await enviarMeta(WHATSAPP_PERSONAL, MENSAJE_AVISO, {
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_AVISO_MS)
    });
    if (!resultado.ok || !resultado.idWhatsapp) {
      console.warn("QRegalo: aviso personal no enviado; chat sigue normal", {
        numeroCliente, estadoMeta: resultado.status,
        codigoMeta: resultado.datos?.error?.code || null
      });
      return;
    }
    // El idWhatsapp sirve para relacionar esta aceptación con los eventos
    // posteriores «sent», «delivered», «read» o «failed» que mande Meta.
    console.log("QRegalo: aviso personal aceptado por Meta", {
      numeroCliente, idWhatsapp: resultado.idWhatsapp
    });
  } catch (error) {
    // La notificación nunca debe hacer fallar el webhook ni el chat principal.
    console.warn("QRegalo: fallo no crítico notificando al WhatsApp personal", {
      numeroCliente, error: error?.message || String(error)
    });
  }
}

// Los estados de entrega llegan en value.statuses (no en value.messages).
// No se guardan ni cambian la lógica del chat: solo sirven para diagnóstico.
function registrarEstadosWhatsAppPersonal(value) {
  for (const estado of (Array.isArray(value.statuses) ? value.statuses : [])) {
    // Limitar los logs a mensajes destinados al WhatsApp del administrador.
    if (String(estado?.recipient_id || "").replace(/\D/g, "") !== WHATSAPP_PERSONAL) continue;

    const errores = (Array.isArray(estado.errors) ? estado.errors : []).map((e) => ({
      codigo: e.code ?? null,
      titulo: String(e.title || "").slice(0, 300),
      mensaje: String(e.message || "").slice(0, 400),
      detalle: String(e.error_data?.details || "").slice(0, 500)
    }));
    const diagnostico = {
      estado: String(estado.status || "desconocido"),
      idWhatsapp: String(estado.id || ""),
      fechaMeta: estado.timestamp || null,
      ...(errores.length ? { errores } : {})
    };
    if (estado.status === "failed") {
      console.warn("QRegalo: entrega WhatsApp personal FALLIDA", diagnostico);
    } else {
      console.log("QRegalo: estado entrega WhatsApp personal", diagnostico);
    }
  }
}

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

  // Primero guardamos y procesamos los mensajes, luego intentamos los avisos.
  // Así un fallo de WhatsApp al avisar nunca deshace el guardado del cliente.
  const numerosParaAvisar = new Set();
  try {
    const db = bd();
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const phoneId = value.metadata?.phone_number_id;
        if (phoneId && phoneId !== process.env.META_PHONE_NUMBER_ID) continue;

        // Los estados no son mensajes entrantes y nunca deben generar avisos.
        // Cualquier fallo del diagnóstico no afecta al webhook principal.
        try { registrarEstadosWhatsAppPersonal(value); }
        catch (error) {
          console.warn("QRegalo: no se pudo registrar un estado de entrega", error?.message);
        }

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

            // Guardar el momento del INTENTO dentro de esta misma transacción
            // evita avisos duplicados por mensajes simultáneos o reintentos.
            // No notificar los mensajes enviados desde nuestro número personal.
            const avisoAnterior = fechaMs(anterior.ultimaNotificacionPersonalIntentadaEn);
            const correspondeAviso = numero !== WHATSAPP_PERSONAL &&
              (!Number.isFinite(avisoAnterior) ||
                ahora.getTime() - avisoAnterior >= INTERVALO_AVISOS_MS);

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
              errorAutomatico: null,
              ...(correspondeAviso ? { ultimaNotificacionPersonalIntentadaEn: ahora } : {})
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
            return { correspondeAviso };
          });

          if (nuevo) {
            console.log("QRegalo: mensaje guardado; espera automática 20 min:", numero);
            if (nuevo.correspondeAviso) numerosParaAvisar.add(numero);
          } else {
            console.log("QRegalo: duplicado ignorado");
          }
        }
      }
    }
  } catch (error) {
    console.error("QRegalo: fallo guardando webhook; Meta puede reintentar", error);
    return json(500, { error: "Error guardando el mensaje" });
  }

  // Independiente de la lógica existente. Los avisos se intentan solo cuando
  // el mensaje ya fue guardado; cualquier error se registra y se ignora.
  if (numerosParaAvisar.size) {
    await Promise.all([...numerosParaAvisar].map(enviarAvisoNoCritico));
  }

  return { statusCode: 200, body: "OK" };
};
