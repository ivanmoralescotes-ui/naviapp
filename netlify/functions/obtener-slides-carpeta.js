const { Storage } = require("@google-cloud/storage");
const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const SIGNED_URL_HOURS = 6;

const EXTENSIONES_IMAGEN = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
  ".bmp", ".svg", ".heic", ".heif"
]);

const EXTENSIONES_VIDEO = new Set([
  ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv",
  ".3gp", ".3g2", ".mpeg", ".mpg"
]);

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(405, {
      error: "Método no permitido. Usa una solicitud POST."
    }, {
      Allow: "POST"
    });
  }

  try {
    const body = leerJson(event);
    const carpeta = normalizarCarpeta(body.carpeta);
    const passwordLectura =
      typeof body.passwordLectura === "string"
        ? body.passwordLectura
        : "";

    if (!carpeta) {
      return responder(400, {
        error: "El nombre de la carpeta no es válido."
      });
    }

    if (passwordLectura.length > 100) {
      return responder(400, {
        error: "La contraseña para ver el contenido no es válida."
      });
    }

    const datosConfiguracion = await obtenerDatosConfiguracion(
      carpeta
    );

    if (!datosConfiguracion) {
      return responder(404, {
        error: "No se encontró la configuración asociada a este código."
      });
    }

    if (!validarClaveLectura(
      passwordLectura,
      datosConfiguracion.claveLectura
    )) {
      return responder(401, {
        error: "Clave incorrecta."
      });
    }

    const { storage, bucketName } = crearClienteStorage();
    const bucket = storage.bucket(bucketName);
    const prefijo = `${carpeta}/`;
    const [objetos] = await bucket.getFiles({ prefix: prefijo });

    const multimedia = objetos
      .map((archivo) => ({
        archivo,
        categoria: obtenerCategoria(archivo)
      }))
      .filter(({ archivo, categoria }) => {
        const relativo = archivo.name.slice(prefijo.length);

        return Boolean(
          categoria &&
          relativo &&
          !relativo.includes("/") &&
          !archivo.name.endsWith("/")
        );
      })
      .sort((a, b) =>
        a.archivo.name.localeCompare(b.archivo.name, "es", {
          numeric: true,
          sensitivity: "base"
        })
      );

    const archivos = await Promise.all(
      multimedia.map(async ({ archivo, categoria }) => {
        const [url] = await archivo.getSignedUrl({
          version: "v4",
          action: "read",
          expires:
            Date.now() +
            SIGNED_URL_HOURS * 60 * 60 * 1000
        });

        return {
          nombre: archivo.name.slice(prefijo.length),
          ruta: archivo.name,
          tipo:
            archivo.metadata?.contentType ||
            inferirContentType(archivo.name, categoria),
          categoria,
          tamanoBytes: obtenerNumeroSeguro(
            archivo.metadata?.size
          ),
          url
        };
      })
    );

    return responder(200, {
      carpeta,
      cantidad: archivos.length,
      archivos,
      imagenes: archivos.filter(
        (archivo) => archivo.categoria === "imagen"
      ),
      videos: archivos.filter(
        (archivo) => archivo.categoria === "video"
      )
    });
  } catch (error) {
    console.error(
      "Error obteniendo slides de Storage:",
      error?.message || error
    );

    return responder(500, {
      error: obtenerMensajeErrorServidor(error)
    });
  }
};

function validarClaveLectura(password, claveGuardada) {
  const valorGuardado =
    claveGuardada == null ? "" : String(claveGuardada).trim();

  if (!valorGuardado) {
    return true;
  }

  return String(simpleStringHash(password)) === valorGuardado;
}

function simpleStringHash(valor) {
  let hash = 0;

  for (let indice = 0; indice < valor.length; indice += 1) {
    const caracter = valor.charCodeAt(indice);
    hash = (hash << 5) - hash + caracter;
    hash |= 0;
  }

  return hash;
}

async function obtenerDatosConfiguracion(carpeta) {
  const firestore = crearClienteFirestore();
  const documento = await firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(`prop${carpeta}`)
    .get();

  return documento.exists ? documento.data() : null;
}

function crearClienteFirestore() {
  const credentials = obtenerCredencialesGoogle();

  return new Firestore({
    projectId: FIRESTORE_PROJECT_ID,
    credentials
  });
}

function crearClienteStorage() {
  const credentials = obtenerCredencialesGoogle();
  const bucketName = process.env.GCS_BUCKET;

  if (!bucketName) {
    throw new Error("Falta la variable de entorno GCS_BUCKET.");
  }

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials
  });

  return { storage, bucketName };
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

  const carpeta = valor.trim().replace(/^\/+|\/+$/g, "");

  return /^[a-zA-Z0-9_-]+$/.test(carpeta)
    ? carpeta
    : "";
}

function obtenerCategoria(archivo) {
  const contentType = String(
    archivo.metadata?.contentType || ""
  ).toLowerCase();

  if (contentType.startsWith("image/")) {
    return "imagen";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  const extension = obtenerExtension(archivo.name);

  if (EXTENSIONES_IMAGEN.has(extension)) {
    return "imagen";
  }

  if (EXTENSIONES_VIDEO.has(extension)) {
    return "video";
  }

  return "";
}

function obtenerExtension(nombre) {
  const valor = String(nombre || "").toLowerCase();
  const punto = valor.lastIndexOf(".");

  return punto >= 0 ? valor.slice(punto) : "";
}

function inferirContentType(nombre, categoria) {
  const extension = obtenerExtension(nombre);
  const tipos = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".3g2": "video/3gpp2",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg"
  };

  return tipos[extension] ||
    (categoria === "imagen" ? "image/*" : "video/*");
}

function obtenerNumeroSeguro(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
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
    error.codigoHttp = 400;
    throw error;
  }
}

function obtenerMensajeErrorServidor(error) {
  if (error?.codigoHttp === 400) {
    return error.message;
  }

  const mensaje = String(error?.message || "");

  if (
    mensaje.includes("PERMISSION_DENIED") ||
    mensaje.includes("permission") ||
    mensaje.includes("403")
  ) {
    return (
      "La cuenta de servicio no tiene permiso para consultar " +
      "Firestore o Google Cloud Storage."
    );
  }

  return "No fue posible obtener el contenido multimedia.";
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
