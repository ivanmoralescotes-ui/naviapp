const { Storage } = require("@google-cloud/storage");

const EXTENSIONES_IMAGEN = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".heic",
  ".heif"
]);

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return responder(405, {
      error: "Método no permitido. Usa una solicitud GET."
    }, {
      Allow: "GET"
    });
  }

  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const bucketName = process.env.GCS_BUCKET;

    if (!credentialsJson || !bucketName) {
      return responder(500, {
        error: "Faltan las variables de entorno del servidor."
      });
    }

    const carpeta = normalizarCarpeta(
      event.queryStringParameters?.carpeta
    );

    if (!carpeta) {
      return responder(400, {
        error: "Debes enviar un nombre de carpeta válido en el parámetro 'carpeta'.",
        ejemplo: "/.netlify/functions/obtener-imagenes-carpeta?carpeta=fly"
      });
    }

    const credentials = JSON.parse(credentialsJson);

    const storage = new Storage({
      projectId: credentials.project_id,
      credentials
    });

    const bucket = storage.bucket(bucketName);
    const prefijo = `${carpeta}/`;

    /*
     * Google Cloud Storage no tiene carpetas reales:
     * se consultan todos los objetos cuyo nombre comienza por "carpeta/".
     */
    const [archivos] = await bucket.getFiles({
      prefix: prefijo
    });

    /*
     * Solo se incluyen imágenes ubicadas directamente dentro de la carpeta.
     * No se incluyen imágenes de subcarpetas.
     */
    const imagenesEncontradas = archivos
      .filter((archivo) => {
        const nombreRelativo = archivo.name.slice(prefijo.length);

        if (
          !nombreRelativo ||
          nombreRelativo.includes("/") ||
          archivo.name.endsWith("/")
        ) {
          return false;
        }

        return esImagen(archivo);
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es", {
          numeric: true,
          sensitivity: "base"
        })
      );

    const imagenes = await Promise.all(
      imagenesEncontradas.map(async (archivo) => {
        const [urlFirmada] = await archivo.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 10 * 60 * 1000
        });

        return {
          nombre: archivo.name.slice(prefijo.length),
          ruta: archivo.name,
          tipo: archivo.metadata?.contentType || null,
          tamanoBytes: obtenerNumeroSeguro(archivo.metadata?.size),
          url: urlFirmada
        };
      })
    );

    return responder(200, {
      carpeta,
      cantidad: imagenes.length,
      imagenes
    });
  } catch (error) {
    console.error(
      "Error obteniendo las imágenes de la carpeta:",
      error.message
    );

    return responder(500, {
      error: "No fue posible obtener las imágenes de la carpeta."
    });
  }
};

function normalizarCarpeta(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  let carpeta;

  try {
    carpeta = decodeURIComponent(valor);
  } catch {
    return "";
  }

  carpeta = carpeta
    .trim()
    .replace(/^\/+|\/+$/g, "");

  /*
   * Permite letras, números, guiones y guion bajo.
   * Esto evita "..", barras y otros caracteres de ruta no deseados.
   */
  if (!/^[a-zA-Z0-9_-]+$/.test(carpeta)) {
    return "";
  }

  return carpeta;
}

function esImagen(archivo) {
  const contentType = archivo.metadata?.contentType || "";

  if (contentType.startsWith("image/")) {
    return true;
  }

  const nombre = archivo.name.toLowerCase();
  const punto = nombre.lastIndexOf(".");
  const extension = punto >= 0 ? nombre.slice(punto) : "";

  return EXTENSIONES_IMAGEN.has(extension);
}

function obtenerNumeroSeguro(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
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
