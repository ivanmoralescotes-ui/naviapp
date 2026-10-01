const crypto = require("crypto");
const { Firestore, Timestamp } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const CAMPO_FECHA = "lastupdate";
const MAX_FILAS_PERMITIDAS = 200;
const MAX_HORAS_PERMITIDAS = 8760;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(405, { error: "Método no permitido." }, { Allow: "POST" });
  }

  try {
    const body = leerJson(event);
    const accion = typeof body.accion === "string" ? body.accion.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) {
      return responder(400, { error: "Falta la contraseña." });
    }

    if (!validarPassword(password)) {
      return responder(401, { error: "La contraseña no es correcta." });
    }

    if (accion === "validar") {
      return responder(200, { ok: true });
    }

    if (accion !== "consultar") {
      return responder(400, { error: "La acción solicitada no es válida." });
    }

    const horas = Number(body.horas);
    const maximoFilas = Number(body.maximoFilas);

    if (!Number.isFinite(horas) || horas <= 0 || horas > MAX_HORAS_PERMITIDAS) {
      return responder(400, {
        error: `Las horas deben estar entre 0 y ${MAX_HORAS_PERMITIDAS}.`
      });
    }

    if (
      !Number.isInteger(maximoFilas) ||
      maximoFilas <= 0 ||
      maximoFilas > MAX_FILAS_PERMITIDAS
    ) {
      return responder(400, {
        error: `El máximo de filas debe estar entre 1 y ${MAX_FILAS_PERMITIDAS}.`
      });
    }

    const ahora = new Date();
    const fechaLimite = new Date(
      ahora.getTime() - horas * 60 * 60 * 1000
    );

    const firestore = crearClienteFirestore();

    const snapshot = await firestore
      .collection(FIRESTORE_COLLECTION)
      .where(CAMPO_FECHA, ">=", Timestamp.fromDate(fechaLimite))
      .orderBy(CAMPO_FECHA, "desc")
      .limit(maximoFilas)
      .get();

    const resultados = snapshot.docs.map((documento) => {
      const datos = documento.data() || {};
      const fecha = convertirFecha(datos[CAMPO_FECHA]);

      return {
        id: documento.id,
        lastupdate: fecha ? fecha.toISOString() : null,
        elementos: Array.isArray(datos.ordenArchivosStorage)
          ? datos.ordenArchivosStorage.length
          : 0
      };
    });

    return responder(200, {
      ok: true,
      ahora: ahora.toISOString(),
      fechaLimite: fechaLimite.toISOString(),
      resultados
    });
  } catch (error) {
    console.error("Error consultar-list-updated:", error?.message || error);

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, { error: error.message });
    }

    return responder(500, {
      error: "No fue posible consultar los documentos."
    });
  }
};

function validarPassword(passwordIngresado) {
  const passwordConfigurado = process.env.LIST_UPDATED_PASSWORD;

  if (!passwordConfigurado) {
    throw new Error(
      "Falta la variable de entorno LIST_UPDATED_PASSWORD."
    );
  }

  const a = crypto.createHash("sha256")
    .update(passwordIngresado, "utf8")
    .digest();

  const b = crypto.createHash("sha256")
    .update(passwordConfigurado, "utf8")
    .digest();

  return crypto.timingSafeEqual(a, b);
}

function convertirFecha(valor) {
  if (!valor) return null;

  if (typeof valor.toDate === "function") {
    const fecha = valor.toDate();
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor === "string") {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  return null;
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
    const error = new Error("JSON inválido.");
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
