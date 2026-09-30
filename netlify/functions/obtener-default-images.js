const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return responder(
      405,
      { error: "Método no permitido. Usa GET." },
      { Allow: "GET" }
    );
  }

  try {
    const firestore = crearClienteFirestore();

    const documento = await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc("defaultimage")
      .get();

    if (!documento.exists) {
      return responder(404, {
        error: "No se encontró la configuración de imágenes predeterminadas."
      });
    }

    const datos = documento.data() || {};

    return responder(200, {
      img0: valorSeguro(datos.img0),
      img2: valorSeguro(datos.img2),
      img3: valorSeguro(datos.img3)
    });
  } catch (error) {
    console.error(
      "Error obteniendo imágenes predeterminadas:",
      error?.message || error
    );

    return responder(500, {
      error: "No fue posible obtener las imágenes predeterminadas."
    });
  }
};

function valorSeguro(valor) {
  return typeof valor === "string" ? valor : "";
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

function responder(statusCode, contenido, headersAdicionales = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...headersAdicionales
    },
    body: JSON.stringify(contenido)
  };
}
