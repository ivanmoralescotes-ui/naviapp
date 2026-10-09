"use strict";
const { bd, json, verificarAdmin, fechaIso, COLECCION, CONVERSACIONES } = require("../lib/qregalo-comun");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Método no permitido" });
  const autenticacion = await verificarAdmin(event);
  if (autenticacion.error) return json(autenticacion.status, { error: autenticacion.error });

  try {
    const db = bd();
    const [resultado, configuraciones] = await Promise.all([
      db.collection(COLECCION).orderBy("fecha", "desc").limit(300).get(),
      db.collection(CONVERSACIONES).limit(500).get()
    ]);
    const mensajes = resultado.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id, numeroCliente: String(d.numeroCliente || ""),
        direccion: d.direccion || "", tipo: d.tipo || "text",
        texto: d.texto || "", fecha: fechaIso(d.fecha || d.fechaGuardado),
        idWhatsapp: d.idWhatsapp || null,
        nombreArchivo: d.nombreArchivo || null,
        mimeType: d.mimeType || null,
        origen: d.origen || null
      };
    }).reverse();
    const modos = {};
    for (const doc of configuraciones.docs) {
      const d = doc.data();
      modos[doc.id] = {
        autoEnabled: d.autoEnabled !== false,
        autoPendienteHasta: fechaIso(d.autoPendienteHasta),
        errorAutomatico: d.errorAutomatico || null
      };
    }
    return json(200, { success: true, mensajes, total: mensajes.length,
      limite: 300, hayMas: mensajes.length === 300, modos });
  } catch (error) {
    console.error("QRegalo: error consultando mensajes", error);
    return json(500, { error: "No se pudieron consultar los mensajes" });
  }
};
