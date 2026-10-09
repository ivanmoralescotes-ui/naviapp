"use strict";
const {
  bd, json, verificarAdmin, fechaMs, identificador, validaNumero,
  enviarMeta, FieldValue, COLECCION, CONVERSACIONES,
  PENDIENTES, VENTANA_MS, MARGEN_MS
} = require("../lib/qregalo-comun");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });
  const autenticacion = await verificarAdmin(event);
  if (autenticacion.error) return json(autenticacion.status, { error: autenticacion.error });
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (_) { return json(400, { error: "JSON inválido" }); }
  const numero = String(body.numeroCliente || "").trim();
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!validaNumero(numero) || !texto || texto.length > 4096) {
    return json(400, { error: "Número o mensaje inválido (máximo 4096 caracteres)" });
  }

  try {
    const db = bd();
    const convRef = db.collection(CONVERSACIONES).doc(numero);
    const pendRef = db.collection(PENDIENTES).doc(numero);
    // Compatibilidad con el historial creado antes del nuevo webhook.
    const historial = await db.collection(COLECCION).where("numeroCliente", "==", numero).get();
    let ultimaEntrada = -Infinity;
    historial.forEach(doc => {
      const d = doc.data();
      if (d.direccion === "entrante") {
        const ms = fechaMs(d.fecha || d.fechaGuardado);
        if (Number.isFinite(ms)) ultimaEntrada = Math.max(ultimaEntrada, ms);
      }
    });
    if (ultimaEntrada === -Infinity || Date.now() - ultimaEntrada >= VENTANA_MS - MARGEN_MS) {
      return json(409, { error: "Ventana de 24 horas cerrada. Espera otro mensaje del cliente o utiliza una plantilla aprobada." });
    }

    // Antes de llamar a Meta, cancelar la respuesta automática pendiente.
    await db.runTransaction(async (t) => {
      const [conv, pend] = await Promise.all([t.get(convRef), t.get(pendRef)]);
      // Si una ejecución anterior quedó colgada, permitir continuar pasado 2 min.
      // Antes de reintentar un mensaje ambiguo, siempre revisar el chat.
      if (pend.exists && pend.data().estado === "enviando" &&
          Date.now() - fechaMs(pend.data().fechaInicio) < 2 * 60 * 1000) {
        throw Object.assign(new Error("La respuesta automática está enviándose ahora; espera unos segundos"), { statusCode: 409 });
      }
      const d = conv.exists ? conv.data() : {};
      t.set(convRef, {
        numeroCliente: numero,
        autoEnabled: d.autoEnabled !== false,
        version: (Number(d.version) || 0) + 1,
        autoPendienteHasta: null,
        ultimaIntervencionManual: new Date()
      }, { merge: true });
      if (pend.exists) t.delete(pendRef);
    });

    let resultado;
    try { resultado = await enviarMeta(numero, texto); }
    catch (error) {
      console.error("QRegalo: error de red enviando desde el panel", error);
      return json(502, { error: "No se pudo confirmar el envío. Revisa WhatsApp antes de reintentar. La respuesta automática pendiente quedó cancelada." });
    }
    if (!resultado.ok) {
      console.error("QRegalo: Meta rechazó el envío", resultado.status, resultado.datos.error?.code);
      return json(502, { error: (resultado.datos.error?.message || "Meta rechazó el mensaje") + ". La respuesta automática pendiente quedó cancelada." });
    }

    let guardado = false;
    try {
      const id = identificador("out", resultado.idWhatsapp || require("node:crypto").randomUUID());
      await db.collection(COLECCION).doc(id).create({
        numeroCliente: numero, direccion: "saliente", tipo: "text",
        texto, idWhatsapp: resultado.idWhatsapp,
        fecha: new Date(), fechaGuardado: FieldValue.serverTimestamp(),
        origen: "panel_qregalo"
      });
      guardado = true;
    } catch (error) { console.error("QRegalo: se envió pero no se guardó", error); }

    return json(200, { success: true, guardado,
      aviso: guardado ? null : "Enviado, pero falló el guardado. No lo reenvíes sin comprobar el chat." });
  } catch (error) {
    console.error("QRegalo: error enviando mensaje", error);
    return json(error.statusCode || 500, { error: error.statusCode ? error.message : "No se pudo enviar el mensaje" });
  }
};
