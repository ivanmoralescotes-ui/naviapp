const crypto = require("crypto");
const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const MIN_PASSWORD_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 20;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(
      405,
      { error: "Método no permitido." },
      { Allow: "POST" }
    );
  }

  try {
    const body = leerJson(event);

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const carpeta = normalizarCarpeta(body.carpeta);

    const passwordNueva =
      typeof body.passwordNueva === "string"
        ? body.passwordNueva.trim()
        : "";

    if (!password) {
      return responder(400, {
        error: "Falta la contraseña del monitor."
      });
    }

    if (!validarPasswordMonitor(password)) {
      return responder(401, {
        error: "La contraseña del monitor no es correcta."
      });
    }

    if (!carpeta) {
      return responder(400, {
        error: "El código recibido no es válido."
      });
    }

    if (
      passwordNueva.length < MIN_PASSWORD_LENGTH ||
      passwordNueva.length > MAX_PASSWORD_LENGTH
    ) {
      return responder(400, {
        error:
          `La nueva clave debe tener entre ` +
          `${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`
      });
    }

    const firestore = crearClienteFirestore();

    const documentoRef = firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`);

    const documento = await documentoRef.get();

    if (!documento.exists) {
      return responder(404, {
        error: `No existe el documento prop${carpeta} en configg.`
      });
    }

    // El sistema actual guarda en "clave" el hash numérico
    // producido por simpleStringHash(), no la contraseña en texto plano.
    const nuevaClave = simpleStringHash(passwordNueva);

    await documentoRef.set(
      {
        clave: nuevaClave
      },
      {
        merge: true
      }
    );

    return responder(200, {
      ok: true,
      actualizado: true,
      documento: `prop${carpeta}`,
      mensaje: "Clave asignada correctamente."
    });

  } catch (error) {
    console.error(
      "Error asignando la clave de configuración:",
      error?.message || error
    );

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error: "No fue posible asignar la clave."
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

function validarPasswordMonitor(passwordIngresado) {
  const passwordConfigurado =
    process.env.LIST_UPDATED_PASSWORD;

  if (!passwordConfigurado) {
    throw new Error(
      "Falta la variable de entorno LIST_UPDATED_PASSWORD."
    );
  }

  const a = crypto
    .createHash("sha256")
    .update(passwordIngresado, "utf8")
    .digest();

  const b = crypto
    .createHash("sha256")
    .update(passwordConfigurado, "utf8")
    .digest();

  return crypto.timingSafeEqual(a, b);
}

function normalizarCarpeta(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const carpeta = valor.trim();

  return /^[a-zA-Z0-9_-]{3}$/.test(carpeta)
    ? carpeta
    : "";
}

function crearClienteFirestore() {
  return new Firestore({
    projectId: FIRESTORE_PROJECT_ID,
    credentials: obtenerCredencialesGoogle()
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
      "GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido."
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

function leerJson(event) {
  if (!event.body) {
    return {};
  }

  const contenido = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(contenido);
  } catch {
    const error = new Error("JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

function responder(
  statusCode,
  body,
  extraHeaders = {}
) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}
