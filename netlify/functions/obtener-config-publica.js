const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(
      405,
      { error: "Método no permitido. Usa una solicitud POST." },
      { Allow: "POST" }
    );
  }

  try {
    const body = leerJson(event);
    const carpeta = normalizarCarpeta(body.carpeta);

    if (!carpeta) {
      return responder(400, {
        error: "El código recibido no es válido."
      });
    }

    const firestore = crearClienteFirestore();
    const documento = await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`)
      .get();

    if (!documento.exists) {
      return responder(404, {
        error: "No se encontró la configuración asociada a este código."
      });
    }

    const datos = documento.data() || {};

    /*
     * IMPORTANTE:
     * Se devuelve únicamente lo que index.html necesita.
     * NO se devuelven campos privados como:
     * - clave
     * - akey
     */
    return responder(200, {
      claveLectura: valorSeguro(datos.claveLectura),
      versiculo: valorSeguro(datos.versiculo),
      motivacional: valorSeguro(datos.motivacional),
      numerosuerte: valorSeguro(datos.numerosuerte),
      instagram: valorSeguro(datos.instagram),
      whatsapp: valorSeguro(datos.whatsapp),
      spotify: valorSeguro(datos.spotify),
      palabras: valorSeguro(datos.palabras),
      ia1: valorSeguro(datos.ia1),
      tipoIa: valorSeguro(datos.tipoIa),
      isEnglish: valorSeguro(datos.isEnglish),
      linkpublicidad: valorSeguro(datos.linkpublicidad),
      nombrepublicidad: valorSeguro(datos.nombrepublicidad),
      images: Array.isArray(datos.images) ? datos.images : [],
      segundosslide:
        datos.segundosslide == null ? "" : datos.segundosslide,
      linkdirecto: valorSeguro(datos.linkdirecto)
    });
  } catch (error) {
    console.error(
      "Error obteniendo configuración pública:",
      error?.message || error
    );

    return responder(500, {
      error: "No fue posible consultar la configuración."
    });
  }
};

function valorSeguro(valor) {
  if (
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  ) {
    return valor;
  }

  return "";
}

function crearClienteFirestore() {
  const credentials = obtenerCredencialesGoogle();

  return new Firestore({
    projectId: FIRESTORE_PROJECT_ID,
    credentials
  });
}

function obtenerCredencialesGoogle() {
  const credentialsJson =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!credentialsJson) {
    throw new Error(
      "Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON no contiene un JSON válido."
    );
  }

  if (
    !credentials.project_id ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error(
      "Las credenciales de Google no contienen los campos requeridos."
    );
  }

  return credentials;
}

function normalizarCarpeta(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const carpeta = valor
    .trim()
    .replace(/^\/+|\/+$/g, "");

  return /^[a-zA-Z0-9_-]+$/.test(carpeta)
    ? carpeta
    : "";
}

function leerJson(event) {
  if (!event.body) {
    return {};
  }

  const texto = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(texto);
  } catch {
    const error = new Error(
      "El cuerpo de la solicitud no contiene un JSON válido."
    );
    error.statusCode = 400;
    throw error;
  }
}

function responder(
  statusCode,
  contenido,
  headersAdicionales = {}
) {
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
