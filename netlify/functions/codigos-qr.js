const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "codigos";
const RUTA_PERMITIDA = "/imgs/qr/";

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "GET") {
      return await listarDisponibles();
    }

    if (event.httpMethod === "POST") {
      return await reservarCodigo(event);
    }

    return responder(405, { error: "Método no permitido." }, { Allow: "GET, POST" });
  } catch (error) {
    console.error("Error en codigos-qr:", error?.message || error);

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, { error: error.message });
    }

    return responder(500, {
      error: "No fue posible procesar la solicitud."
    });
  }
};

async function listarDisponibles() {
  const firestore = crearClienteFirestore();

  const snapshot = await firestore
    .collection(FIRESTORE_COLLECTION)
    .where("estado", "==", "disponible")
    .get();

  const codigos = snapshot.docs
    .map((documento) => {
      const datos = documento.data() || {};
      const ruta = normalizarRuta(datos.ruta);

      if (!ruta) {
        return null;
      }

      return {
        id: documento.id,
        nombre: normalizarNombre(datos.nombre, documento.id),
        ruta
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      a.id.localeCompare(b.id, "es", {
        numeric: true,
        sensitivity: "base"
      })
    );

  return responder(200, { codigos });
}

async function reservarCodigo(event) {
  const body = leerJson(event);
  const id = normalizarId(body.id);

  if (!id) {
    throw crearError(400, "El código recibido no es válido.");
  }

  const firestore = crearClienteFirestore();
  const documentoRef = firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(id);

  let resultado = null;

  await firestore.runTransaction(async (transaccion) => {
    const documento = await transaccion.get(documentoRef);

    if (!documento.exists) {
      throw crearError(404, "El código solicitado no existe.");
    }

    const datos = documento.data() || {};
    const estado = typeof datos.estado === "string"
      ? datos.estado.trim().toLowerCase()
      : "";

    if (estado !== "disponible") {
      throw crearError(409, "Este código ya no está disponible.");
    }

    const ruta = normalizarRuta(datos.ruta);

    if (!ruta) {
      throw crearError(
        409,
        "Este código no tiene una imagen válida disponible."
      );
    }

    transaccion.update(documentoRef, {
      estado: "reservado"
    });

    resultado = {
      id: documento.id,
      nombre: normalizarNombre(datos.nombre, documento.id),
      ruta,
      estado: "reservado"
    };
  });

  return responder(200, {
    reservado: true,
    codigo: resultado
  });
}

function normalizarId(valor) {
  if (typeof valor !== "string") return "";
  const id = valor.trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : "";
}

function normalizarNombre(valor, id) {
  if (typeof valor !== "string") return id;
  const nombre = valor.trim();
  return nombre ? nombre.slice(0, 120) : id;
}

function normalizarRuta(valor) {
  if (typeof valor !== "string") return "";

  const ruta = valor.trim();

  if (!ruta.startsWith(RUTA_PERMITIDA)) return "";
  if (ruta.includes("..")) return "";
  if (ruta.includes("\\") || ruta.includes("?") || ruta.includes("#")) return "";

  const resto = ruta.slice(RUTA_PERMITIDA.length);

  if (
    !resto ||
    resto.includes("/") ||
    !/^[a-zA-Z0-9._%()\- ]{1,220}$/.test(resto)
  ) {
    return "";
  }

  return ruta;
}

function crearClienteFirestore() {
  return new Firestore({
    projectId: FIRESTORE_PROJECT_ID,
    credentials: obtenerCredencialesGoogle()
  });
}

function obtenerCredencialesGoogle() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!credentialsJson) {
    throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido.");
  }

  if (
    !credentials.project_id ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Las credenciales de Google no contienen los campos requeridos.");
  }

  return credentials;
}

function leerJson(event) {
  if (!event.body) return {};

  const contenido = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(contenido);
  } catch {
    throw crearError(400, "El cuerpo de la solicitud no contiene JSON válido.");
  }
}

function crearError(statusCode, mensaje) {
  const error = new Error(mensaje);
  error.statusCode = statusCode;
  return error;
}

function responder(statusCode, contenido, headersAdicionales = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headersAdicionales
    },
    body: JSON.stringify(contenido)
  };
}
