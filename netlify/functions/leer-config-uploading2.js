const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const HASH_CLAVE_MAESTRA = 1691068;

const MIN_PASSWORD_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 100;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(
      405,
      { error: "Método no permitido. Usa POST." },
      { Allow: "POST" }
    );
  }

  try {
    const body = leerJson(event);
    const carpeta = normalizarCarpeta(body.carpeta);
    const passwordConfiguracion =
      typeof body.passwordConfiguracion === "string"
        ? body.passwordConfiguracion
        : "";

    if (!carpeta) {
      return responder(400, {
        error: "El código recibido no es válido."
      });
    }

    if (!validarFormatoPassword(passwordConfiguracion)) {
      return responder(400, {
        error: "La contraseña no tiene un formato válido."
      });
    }

    const firestore = crearClienteFirestore();
    const documento = await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`)
      .get();

    if (!documento.exists) {
      return responder(404, {
        error: "No se encontró la configuración."
      });
    }

    const datos = documento.data() || {};

    if (!validarClaveConfiguracion(passwordConfiguracion, datos.clave)) {
      return responder(401, {
        error: "Contraseña incorrecta."
      });
    }

    // Devuelve solo lo necesario para llenar uploading2.
    // No expone clave, akey ni claveLectura.
    return responder(200, {
      linkdirecto: valorSeguro(datos.linkdirecto),
      versiculo: valorSeguro(datos.versiculo),
      motivacional: valorSeguro(datos.motivacional),
      tipoIa: valorSeguro(datos.tipoIa),
      numerosuerte: valorSeguro(datos.numerosuerte),
      spotify: valorSeguro(datos.spotify),
      instagram: valorSeguro(datos.instagram),
      whatsapp: valorSeguro(datos.whatsapp),
      nombre: valorSeguro(datos.nombre),
      linkpublicidad: valorSeguro(datos.linkpublicidad),
      nombrepublicidad: valorSeguro(datos.nombrepublicidad),
      palabras: valorSeguro(datos.palabras),
      images: Array.isArray(datos.images) ? datos.images : [],
      esingles: valorSeguro(datos.esingles),
      segundosslide:
        datos.segundosslide == null ? "" : datos.segundosslide,
      lastupdate: serializarFecha(datos.lastupdate)
    });
  } catch (error) {
    console.error(
      "Error leyendo configuración de uploading2:",
      error?.message || error
    );

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error: "No fue posible consultar la configuración."
    });
  }
};

function simpleStringHash(valor) {
  let hash = 0;

  for (let indice = 0; indice < valor.length; indice += 1) {
    const caracter = valor.charCodeAt(indice);
    hash = (hash << 5) - hash + caracter;
    hash |= 0;
  }

  return hash;
}

function validarClaveConfiguracion(password, claveGuardada) {
  const hashIngresado = simpleStringHash(password);
  const hashGuardado = Number(claveGuardada);

  if (hashIngresado === HASH_CLAVE_MAESTRA) {
    return true;
  }

  return (
    Number.isFinite(hashGuardado) &&
    hashIngresado === hashGuardado
  );
}

function validarFormatoPassword(valor) {
  return (
    typeof valor === "string" &&
    valor.length >= MIN_PASSWORD_LENGTH &&
    valor.length <= MAX_PASSWORD_LENGTH
  );
}

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

function serializarFecha(valor) {
  if (!valor) {
    return "";
  }

  if (typeof valor.toDate === "function") {
    return valor.toDate().toISOString();
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  return valorSeguro(valor);
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

  const carpeta = valor.trim();

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
