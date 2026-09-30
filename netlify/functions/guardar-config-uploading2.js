const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const HASH_CLAVE_MAESTRA = 1691068;

const MIN_PASSWORD_LENGTH = 3;
const MAX_PASSWORD_LENGTH = 100;
const MAX_IMAGES = 50;

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
    const passwordConfiguracionActual =
      typeof body.passwordConfiguracionActual === "string"
        ? body.passwordConfiguracionActual
        : "";

    const configuracion =
      body.configuracion &&
      typeof body.configuracion === "object" &&
      !Array.isArray(body.configuracion)
        ? body.configuracion
        : {};

    if (!carpeta) {
      return responder(400, {
        error: "El código recibido no es válido."
      });
    }

    if (!validarFormatoPassword(passwordConfiguracionActual)) {
      return responder(400, {
        error: "La contraseña actual no tiene un formato válido."
      });
    }

    const nuevaPasswordConfiguracion =
      texto(configuracion.nuevaPasswordConfiguracion);

    if (!validarFormatoPassword(nuevaPasswordConfiguracion)) {
      return responder(400, {
        error: "La nueva contraseña no tiene un formato válido."
      });
    }

    const claveLecturaRaw = texto(configuracion.claveLectura);

    if (
      claveLecturaRaw &&
      (
        claveLecturaRaw.length < MIN_PASSWORD_LENGTH ||
        claveLecturaRaw.length > MAX_PASSWORD_LENGTH
      )
    ) {
      return responder(400, {
        error: "La contraseña para ver el contenido no tiene un formato válido."
      });
    }

    const firestore = crearClienteFirestore();
    const documentoRef = firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`);

    const documento = await documentoRef.get();

    if (documento.exists) {
      const datosActuales = documento.data() || {};

      if (
        !validarClaveConfiguracion(
          passwordConfiguracionActual,
          datosActuales.clave
        )
      ) {
        return responder(401, {
          error: "La contraseña de configuración no es correcta."
        });
      }
    } else {
      // Para crear una configuración nueva se exige la clave maestra.
      if (
        simpleStringHash(passwordConfiguracionActual) !==
        HASH_CLAVE_MAESTRA
      ) {
        return responder(401, {
          error: "No tienes permiso para crear esta configuración."
        });
      }
    }

    const datosParaGuardar = {
      instagram: campo(configuracion.instagram, 500),
      whatsapp: campo(configuracion.whatsapp, 50),
      nombre: campo(configuracion.nombre, 200),

      tipoIa: campo(configuracion.tipoIa, 100),
      lastupdate: new Date(),
      isEnglish: campo(configuracion.isEnglish, 20),
      segundosslide: campo(configuracion.segundosslide, 20),
      palabras: campo(configuracion.palabras, 2000),

      clave: simpleStringHash(nuevaPasswordConfiguracion),
      akey: "",

      versiculo: campo(configuracion.versiculo, 20),
      motivacional: campo(configuracion.motivacional, 20),
      numerosuerte: campo(configuracion.numerosuerte, 20),

      spotify: campo(configuracion.spotify, 2048),
      linkpublicidad: campo(configuracion.linkpublicidad, 2048),
      nombrepublicidad: campo(configuracion.nombrepublicidad, 500),

      images: normalizarImagenes(configuracion.images),

      linkdirecto: campo(configuracion.linkdirecto, 2048),

      claveLectura: claveLecturaRaw
        ? simpleStringHash(claveLecturaRaw)
        : ""
    };

    await documentoRef.set(datosParaGuardar, { merge: true });

    return responder(200, {
      ok: true
    });
  } catch (error) {
    console.error(
      "Error guardando configuración desde uploading2:",
      error?.message || error
    );

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error: "No fue posible guardar la configuración."
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

function texto(valor) {
  return typeof valor === "string" ? valor : "";
}

function campo(valor, maximo) {
  const resultado = texto(valor);

  if (resultado.length > maximo) {
    const error = new Error(
      "Uno de los campos supera la longitud permitida."
    );
    error.statusCode = 400;
    throw error;
  }

  return resultado;
}

function normalizarImagenes(valor) {
  if (!Array.isArray(valor)) {
    return [];
  }

  if (valor.length > MAX_IMAGES) {
    const error = new Error(
      "La lista de imágenes supera la cantidad permitida."
    );
    error.statusCode = 400;
    throw error;
  }

  return valor.map((item) => campo(item, 4096));
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

  const textoBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(textoBody);
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
