"use strict";

const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = "qrpro-f4709";
const COLECCION = "whatsapp_mensajes";
const LIMITE = 300;

function obtenerApp() {
  if (getApps().length) return getApp();

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("No se configuraron las credenciales de Firebase");

  const credenciales = JSON.parse(json);
  if (credenciales.private_key) {
    credenciales.private_key = credenciales.private_key.replace(/\\n/g, "\n");
  }

  return initializeApp({
    credential: cert(credenciales),
    projectId: PROJECT_ID
  });
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

function fechaIso(valor) {
  if (valor && typeof valor.toDate === "function") {
    return valor.toDate().toISOString();
  }
  if (valor instanceof Date) return valor.toISOString();
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return respuesta(405, { error: "Método no permitido" });
  }

  const cabecera = event.headers?.authorization || event.headers?.Authorization || "";
  const coincidencia = cabecera.match(/^Bearer\s+(\S+)$/i);
  if (!coincidencia) return respuesta(401, { error: "Debes iniciar sesión" });

  if (!process.env.QREGALO_ADMIN_UID) {
    return respuesta(503, { error: "Administrador no configurado" });
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
      return respuesta(403, { error: "No tienes permiso para ver los mensajes" });
    }

    const consulta = await getFirestore(app)
      .collection(COLECCION)
      .orderBy("fecha", "desc")
      .limit(LIMITE)
      .get();

    const mensajes = consulta.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        numeroCliente: String(d.numeroCliente || ""),
        direccion: d.direccion || "",
        tipo: d.tipo || "text",
        texto: d.texto || "",
        fecha: fechaIso(d.fecha || d.fechaGuardado),
        idWhatsapp: d.idWhatsapp || null,
        nombreArchivo: d.nombreArchivo || null,
        mimeType: d.mimeType || null
      };
    }).reverse();

    return respuesta(200, {
      success: true,
      mensajes,
      total: mensajes.length,
      limite: LIMITE,
      hayMas: mensajes.length === LIMITE
    });
  } catch (error) {
    console.error("QRegalo: error consultando mensajes", error);
    return respuesta(500, { error: "No se pudieron consultar los mensajes" });
  }
};
