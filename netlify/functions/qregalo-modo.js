"use strict";
const { bd, json, verificarAdmin, validaNumero, fechaMs, CONVERSACIONES, PENDIENTES } = require("../lib/qregalo-comun");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });
  const autenticacion = await verificarAdmin(event);
  if (autenticacion.error) return json(autenticacion.status, { error: autenticacion.error });
  let entrada;
  try { entrada = JSON.parse(event.body || "{}"); }
  catch (_) { return json(400, { error: "JSON inválido" }); }
  const numero = String(entrada.numeroCliente || "").trim();
  if (!validaNumero(numero) || typeof entrada.activado !== "boolean") {
    return json(400, { error: "Número o modo inválido" });
  }

  try {
    const db = bd();
    const convRef = db.collection(CONVERSACIONES).doc(numero);
    const pendRef = db.collection(PENDIENTES).doc(numero);
    // Modo automático se aplica a los PRÓXIMOS mensajes del cliente.
    // Al desactivar también cancelamos cualquier respuesta en espera.
    await db.runTransaction(async (t) => {
      const [conv, pend] = await Promise.all([t.get(convRef), t.get(pendRef)]);
      // Si una ejecución anterior quedó colgada, permitir continuar pasado 2 min.
      // Antes de reintentar un mensaje ambiguo, siempre revisar el chat.
      if (pend.exists && pend.data().estado === "enviando" &&
          Date.now() - fechaMs(pend.data().fechaInicio) < 2 * 60 * 1000) {
        throw Object.assign(new Error("Ya se está enviando una respuesta automática; espera unos segundos"), { statusCode: 409 });
      }
      const actual = conv.exists ? conv.data() : {};
      t.set(convRef, {
        numeroCliente: numero,
        autoEnabled: entrada.activado,
        version: (Number(actual.version) || 0) + 1,
        autoPendienteHasta: null,
        errorAutomatico: null
      }, { merge: true });
      if (pend.exists) t.delete(pendRef);
    });
    return json(200, { success: true, activado: entrada.activado });
  } catch (error) {
    console.error("QRegalo: error cambiando modo", error);
    return json(error.statusCode || 500, { error: error.statusCode ? error.message : "No se pudo cambiar el modo" });
  }
};
