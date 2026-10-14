"use strict";

const { Timestamp, FieldPath } = require("firebase-admin/firestore");
const { bd, json, verificarAdmin, fechaIso, COLECCION, CONVERSACIONES } = require("../lib/qregalo-comun");

const LIMITE_MENSAJES = 300;
const LIMITE_CONVERSACIONES = 500;
// Margen para no perder mensajes que se guarden mientras se consulta la primera página.
const SOLAPE_INICIAL_MS = 60 * 1000;

function crearCursor(timestamp, id = null) {
  // Conservar los nanosegundos de Firestore evita releer el último documento
  // una y otra vez (toDate()/ISO recortaría la precisión a milisegundos).
  return Buffer.from(JSON.stringify({ s: timestamp.seconds, n: timestamp.nanoseconds, id }), "utf8")
    .toString("base64url");
}

function leerCursor(cursor) {
  if (typeof cursor !== "string" || cursor.length > 512) throw new Error("Cursor inválido");
  let datos;
  try { datos = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
  catch (_) { throw new Error("Cursor inválido"); }
  if (!datos || !Number.isSafeInteger(datos.s) || datos.s < 0 ||
      !Number.isInteger(datos.n) || datos.n < 0 || datos.n >= 1e9 ||
      (datos.id !== null && (typeof datos.id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(datos.id)))) {
    throw new Error("Cursor inválido");
  }
  const timestamp = new Timestamp(datos.s, datos.n);
  if (timestamp.toMillis() > Date.now() + 60 * 1000) throw new Error("Cursor inválido");
  return { timestamp, id: datos.id };
}

function representarMensaje(doc) {
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
}

async function obtenerModos(db) {
  const resultado = await db.collection(CONVERSACIONES).limit(LIMITE_CONVERSACIONES).get();
  const modos = {};
  for (const doc of resultado.docs) {
    const d = doc.data();
    modos[doc.id] = {
      autoEnabled: d.autoEnabled !== false,
      autoPendienteHasta: fechaIso(d.autoPendienteHasta),
      errorAutomatico: d.errorAutomatico || null
    };
  }
  return modos;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Método no permitido" });
  const autenticacion = await verificarAdmin(event);
  if (autenticacion.error) return json(autenticacion.status, { error: autenticacion.error });

  const params = event.queryStringParameters || {};
  const incremental = typeof params.cursor === "string" && params.cursor !== "";
  let cursorAnterior = null;
  if (incremental) {
    try { cursorAnterior = leerCursor(params.cursor); }
    catch (_) { return json(400, { error: "Cursor de mensajes inválido. Recarga la página." }); }
  }
  const incluirModos = !incremental || params.modos === "1";

  try {
    const db = bd();
    let consulta;
    let cursor;
    if (!incremental) {
      // Se guarda el instante ANTES de lanzar la consulta, con margen de seguridad.
      // Si se escribe un mensaje durante la descarga inicial, aparecerá en la siguiente.
      cursor = crearCursor(Timestamp.fromMillis(Date.now() - SOLAPE_INICIAL_MS));
      consulta = db.collection(COLECCION).orderBy("fecha", "desc").limit(LIMITE_MENSAJES);
    } else {
      // Paginación estable por fechaGuardado + ID, sin leer el historial completo.
      consulta = db.collection(COLECCION)
        .orderBy("fechaGuardado", "asc")
        .orderBy(FieldPath.documentId(), "asc")
        .limit(LIMITE_MENSAJES);
      if (cursorAnterior.id === null) {
        consulta = consulta.where("fechaGuardado", ">", cursorAnterior.timestamp);
      } else {
        consulta = consulta.startAfter(cursorAnterior.timestamp, cursorAnterior.id);
      }
    }

    const [resultado, modos] = await Promise.all([
      consulta.get(),
      incluirModos ? obtenerModos(db) : Promise.resolve(undefined)
    ]);

    const mensajes = resultado.docs.map(representarMensaje);
    if (!incremental) mensajes.reverse();
    if (incremental && resultado.docs.length) {
      const ultimo = resultado.docs[resultado.docs.length - 1];
      const fechaGuardado = ultimo.get("fechaGuardado");
      if (!fechaGuardado || typeof fechaGuardado.toDate !== "function") {
        throw new Error("El último mensaje no tiene una fechaGuardado válida");
      }
      cursor = crearCursor(fechaGuardado, ultimo.id);
    } else if (incremental) {
      cursor = params.cursor;
    }

    return json(200, {
      success: true,
      tipo: incremental ? "incremental" : "completo",
      mensajes,
      cursor,
      total: mensajes.length,
      limite: LIMITE_MENSAJES,
      hayMas: !incremental && resultado.docs.length === LIMITE_MENSAJES,
      hayMasNuevos: incremental && resultado.docs.length === LIMITE_MENSAJES,
      ...(incluirModos ? { modos } : {})
    });
  } catch (error) {
    console.error("QRegalo: error consultando mensajes", error);
    return json(500, { error: "No se pudieron consultar los mensajes" });
  }
};
