const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const HASH_CLAVE_MAESTRA = 1691068;

const MIN_PASSWORD_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 100;

const MAX_SPOTIFY_LENGTH = 120;
const MAX_LINK_LENGTH = 2048;
const MAX_LINK_TEXT_LENGTH = 500;

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
    const passwordConfiguracion =
      typeof body.passwordConfiguracion === "string"
        ? body.passwordConfiguracion
        : "";

    const spotify = normalizarTexto(body.spotify);
    const linkpublicidad = normalizarTexto(body.linkpublicidad);
    const nombrepublicidad = normalizarTexto(body.nombrepublicidad);
    const linkdirecto = normalizarTexto(body.linkdirecto);

    if (!carpeta) {
      throw crearError(400, "El código recibido no es válido.");
    }

    if (!validarFormatoPassword(passwordConfiguracion)) {
      throw crearError(
        400,
        "La contraseña de configuración no tiene un formato válido."
      );
    }

    validarLongitud(
      spotify,
      MAX_SPOTIFY_LENGTH,
      "El enlace de Spotify es demasiado largo."
    );

    validarLongitud(
      linkpublicidad,
      MAX_LINK_LENGTH,
      "El enlace adicional es demasiado largo."
    );

    validarLongitud(
      nombrepublicidad,
      MAX_LINK_TEXT_LENGTH,
      "El texto del enlace es demasiado largo."
    );

    validarLongitud(
      linkdirecto,
      MAX_LINK_LENGTH,
      "La redirección es demasiado larga."
    );

    const firestore = crearClienteFirestore();
    const documentoRef = firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`);

    const documento = await documentoRef.get();

    if (!documento.exists) {
      throw crearError(
        404,
        "No se encontró la configuración asociada a este código."
      );
    }

    const datos = documento.data();

    if (
      !validarClaveConfiguracion(
        passwordConfiguracion,
        datos.clave
      )
    ) {
      throw crearError(
        401,
        "La contraseña de configuración no es correcta."
      );
    }

    await documentoRef.set(
      {
        spotify,
        linkpublicidad,
        nombrepublicidad,
        linkdirecto,
        lastupdate: new Date()
      },
      { merge: true }
    );

    return responder(200, {
      actualizado: true,
      mensaje: "Opciones adicionales actualizadas correctamente."
    });
  } catch (error) {
    console.error(
      "Error guardando opciones adicionales:",
      error?.message || error
    );

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error: "No fue posible guardar las opciones adicionales."
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

function normalizarTexto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function validarLongitud(valor, maximo, mensaje) {
  if (valor.length > maximo) {
    throw crearError(400, mensaje);
  }
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
    throw crearError(
      400,
      "El cuerpo de la solicitud no contiene un JSON válido."
    );
  }
}

function crearError(statusCode, mensaje) {
  const error = new Error(mensaje);
  error.statusCode = statusCode;
  return error;
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
