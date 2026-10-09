
const { initializeApp, getApps, getApp, cert } =
  require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");

const { getFirestore } =
  require("firebase-admin/firestore");

// Conectar con Firebase
function obtenerApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!json) {
    throw new Error("No hay credenciales de Firebase");
  }

  const credenciales = JSON.parse(json);

  if (credenciales.private_key) {
    credenciales.private_key =
      credenciales.private_key.replace(/\\n/g, "\n");
  }

  return initializeApp({
    credential: cert(credenciales),
    projectId: "qrpro-f4709"
  });
}

// Preparar respuestas HTTP
function responder(codigo, datos) {
  return {
    statusCode: codigo,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(datos)
  };
}

// Convertir fechas de Firebase
function convertirFecha(valor) {
  if (valor && typeof valor.toDate === "function") {
    return valor.toDate().toISOString();
  }
  return null;
}

exports.handler = async (event) => {

  // Solamente permitir consultas GET
  if (event.httpMethod !== "GET") {
    return responder(405, {
      error: "Método no permitido"
    });
  }

  // Verificar que exista el token del usuario
  const autorizacion =
    event.headers?.authorization ||
    event.headers?.Authorization || "";

  const coincidencia =
    autorizacion.match(/^Bearer\s+(\S+)$/i);

  if (!coincidencia) {
    return responder(401, {
      error: "Debes iniciar sesión"
    });
  }

  // No permitir acceso sin administrador configurado
  if (!process.env.QREGALO_ADMIN_UID) {
    return responder(503, {
      error: "Administrador no configurado"
    });
  }

  try {
    const app = obtenerApp();

    // Verificar el token firmado por Firebase
    const usuario = await getAuth(app)
      .verifyIdToken(coincidencia[1]);

    // Verificar que sea el administrador de QRegalo
    if (usuario.uid !== process.env.QREGALO_ADMIN_UID) {
      return responder(403, {
        error: "No tienes permiso para ver los mensajes"
      });
    }

    console.log("Administrador autorizado");

    // Consultar los últimos 100 mensajes
    const db = getFirestore(app);

    const consulta = await db
      .collection("whatsapp_mensajes")
      .orderBy("fecha", "desc")
      .limit(100)
      .get();

    const mensajes = consulta.docs.map(doc => {
      const datos = doc.data();

      return {
        id: doc.id,
        numeroCliente: datos.numeroCliente || "",
        direccion: datos.direccion || "",
        tipo: datos.tipo || "",
        texto: datos.texto || "",
        fecha: convertirFecha(datos.fecha),
        idWhatsapp: datos.idWhatsapp || null
      };
    });

    return responder(200, {
      success: true,
      total: mensajes.length,
      mensajes: mensajes.reverse()
    });

  } catch (error) {
    if (
      typeof error.code === "string" &&
      error.code.startsWith("auth/")
    ) {
      return responder(401, {
        error: "Sesión inválida o caducada"
      });
    }

    console.error("Error consultando mensajes:", error);

    return responder(500, {
      error: "No se pudieron consultar los mensajes"
    });
  }
};
