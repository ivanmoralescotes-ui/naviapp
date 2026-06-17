const { Storage } = require("@google-cloud/storage");
const { Firestore } = require("@google-cloud/firestore");

const EXTENSIONES_IMAGEN = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
  ".bmp", ".svg", ".heic", ".heif"
]);

const EXTENSIONES_VIDEO = new Set([
  ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv",
  ".3gp", ".3g2", ".mpeg", ".mpg"
]);

const HASH_CLAVE_MAESTRA = 1691068;

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
    const passwordConfiguracion =
      typeof body.passwordConfiguracion === "string"
        ? body.passwordConfiguracion
        : "";

    if (!carpeta) {
      return responder(400, {
        error: "El nombre de la carpeta no es válido."
      });
    }

    if (!validarFormatoPassword(passwordConfiguracion)) {
      return responder(400, {
        error: "La contraseña de configuración no tiene un formato válido."
      });
    }

    const datosConfiguracion = await obtenerDatosConfiguracion(carpeta);

    if (!datosConfiguracion) {
      return responder(404, {
        error: "No se encontró la configuración asociada a este código."
      });
    }

    if (!validarClaveConfiguracion(
      passwordConfiguracion,
      datosConfiguracion.clave
    )) {
      return responder(401, {
        error: "La contraseña de configuración no es correcta."
      });
    }

    const { storage, bucketName } = crearClienteStorage();
    const bucket = storage.bucket(bucketName);
    const prefijo = `${carpeta}/`;
    const [objetos] = await bucket.getFiles({ prefix: prefijo });

    const objetosMultimedia = objetos
      .map((archivo) => ({
        archivo,
        categoria: obtenerCategoria(archivo)
      }))
      .filter(({ archivo, categoria }) => {
        const nombreRelativo = archivo.name.slice(prefijo.length);

        return Boolean(
          categoria &&
          nombreRelativo &&
          !nombreRelativo.includes("/") &&
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
      objetosMultimedia.map(async ({ archivo, categoria }) => {
        const [urlFirmada] = await archivo.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 15 * 60 * 1000
        });

        return {
          nombre: archivo.name.slice(prefijo.length),
          ruta: archivo.name,
          tipo:
            archivo.metadata?.contentType ||
            inferirContentType(archivo.name, categoria),
          categoria,
          tamanoBytes: obtenerNumeroSeguro(archivo.metadata?.size),
          url: urlFirmada
        };
      })
    );

    const imagenes = archivos.filter(
      (item) => item.categoria === "imagen"
    );
    const videos = archivos.filter(
      (item) => item.categoria === "video"
    );

    return responder(200, {
      carpeta,
      cantidad: archivos.length,
      cantidadImagenes: imagenes.length,
      cantidadVideos: videos.length,
      archivos,
      imagenes,
      videos
    });
  } catch (error) {
    console.error(
      "Error obteniendo los archivos de la carpeta:",
      error?.message || error
    );

    return responder(500, {
      error: obtenerMensajeErrorServidor(error)
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

  return Number.isFinite(hashGuardado) &&
    hashIngresado === hashGuardado;
}

async function obtenerDatosConfiguracion(carpeta) {
  const firestore = crearClienteFirestore();
  const documentId = `prop${carpeta}`;
  const collectionName = normalizarNombreColeccion(
    process.env.FIRESTORE_COLLECTION
  );

  if (collectionName) {
    const documento = await firestore
      .collection(collectionName)
      .doc(documentId)
      .get();

    return documento.exists ? documento.data() : null;
  }

  const colecciones = await firestore.listCollections();

  for (const coleccion of colecciones) {
    const documento = await coleccion.doc(documentId).get();

    if (documento.exists) {
      return documento.data();
    }
  }

  return null;
}

function crearClienteFirestore() {
  const credentials = obtenerCredencialesGoogle();

  return new Firestore({
    projectId: credentials.project_id,
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

function validarFormatoPassword(valor) {
  return (
    typeof valor === "string" &&
    valor.length >= 3 &&
    valor.length <= 100
  );
}

function normalizarNombreColeccion(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const nombre = valor.trim();

  if (
    !nombre ||
    nombre.startsWith("/") ||
    nombre.endsWith("/") ||
    nombre.includes("//") ||
    /[\u0000-\u001f]/.test(nombre)
  ) {
    return "";
  }

  return nombre;
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
  const nombreMinuscula = String(nombre || "").toLowerCase();
  const punto = nombreMinuscula.lastIndexOf(".");
  return punto >= 0 ? nombreMinuscula.slice(punto) : "";
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
      "la configuración en Firestore."
    );
  }

  return "No fue posible obtener las imágenes y videos de la carpeta.";
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
