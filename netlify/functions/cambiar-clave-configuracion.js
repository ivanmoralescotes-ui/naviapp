const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const HASH_CLAVE_MAESTRA = 1691068;
const MIN_PASSWORD_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 20;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(
      405,
      {
        error: "Método no permitido. Usa una solicitud POST."
      },
      {
        Allow: "POST"
      }
    );
  }

  try {
    const body = leerJson(event);
    const carpeta = normalizarCarpeta(body.carpeta);
    const passwordActual =
      typeof body.passwordActual === "string"
        ? body.passwordActual
        : "";
    const passwordNueva =
      typeof body.passwordNueva === "string"
        ? body.passwordNueva
        : "";

    if (!carpeta) {
      throw crearError(
        400,
        "El código recibido no es válido."
      );
    }

    if (!validarFormatoPassword(passwordActual, 100)) {
      throw crearError(
        400,
        "La contraseña actual no tiene un formato válido."
      );
    }

    if (
      !validarFormatoPassword(
        passwordNueva,
        MAX_PASSWORD_LENGTH
      )
    ) {
      throw crearError(
        400,
        `La nueva contraseña debe tener entre ` +
        `${MIN_PASSWORD_LENGTH} y ` +
        `${MAX_PASSWORD_LENGTH} caracteres.`
      );
    }

    if (passwordActual === passwordNueva) {
      throw crearError(
        400,
        "La nueva contraseña debe ser diferente de la actual."
      );
    }

    const firestore = crearClienteFirestore();
    const documentoRef = firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`);

    await firestore.runTransaction(async (transaccion) => {
      const documento = await transaccion.get(documentoRef);

      if (!documento.exists) {
        throw crearError(
          404,
          "No se encontró la configuración asociada a este código."
        );
      }

      const datos = documento.data();

      if (
        !validarClaveConfiguracion(
          passwordActual,
          datos.clave
        )
      ) {
        throw crearError(
          401,
          "La contraseña actual no es correcta."
        );
      }

      const nuevaClave = simpleStringHash(passwordNueva);

      if (nuevaClave === Number(datos.clave)) {
        throw crearError(
          400,
          "La nueva contraseña debe ser diferente de la actual."
        );
      }

      transaccion.set(
        documentoRef,
        {
          clave: nuevaClave,
          lastupdate: new Date()
        },
        {
          merge: true
        }
      );
    });

    return responder(200, {
      actualizado: true,
      mensaje: "Contraseña actualizada correctamente."
    });
  } catch (error) {
    console.error(
      "Error cambiando la contraseña de configuración:",
      error?.message || error
    );

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error:
        "No fue posible cambiar la contraseña de configuración."
    });
  }
};

function simpleStringHash(valor) {
  let hash = 0;

  for (
    let indice = 0;
    indice < valor.length;
    indice += 1
  ) {
    const caracter = valor.charCodeAt(indice);
    hash = (hash << 5) - hash + caracter;
    hash |= 0;
  }

  return hash;
}

function validarClaveConfiguracion(
  password,
  claveGuardada
) {
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

function validarFormatoPassword(valor, maximo) {
  return (
    typeof valor === "string" &&
    valor.length >= MIN_PASSWORD_LENGTH &&
    valor.length <= maximo
  );
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
      "Falta la variable de entorno " +
      "GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON no contiene " +
      "un JSON válido."
    );
  }

  if (
    !credentials.project_id ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error(
      "Las credenciales de Google no contienen " +
      "los campos requeridos."
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
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headersAdicionales
    },
    body: JSON.stringify(contenido)
  };
}
