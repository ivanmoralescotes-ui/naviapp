const { Storage } = require("@google-cloud/storage");

const PASSWORD_TEMPORAL = "2233";
const MAX_IMAGES = 7;
const MAX_VIDEOS = 2;

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

    if (body.passwordConfiguracion !== PASSWORD_TEMPORAL) {
      return responder(401, {
        error: "La contraseña de configuración no es correcta."
      });
    }

    const carpeta = normalizarCarpeta(body.carpeta);

    if (!carpeta) {
      return responder(400, {
        error: "El nombre de la carpeta no es válido."
      });
    }

    const rutasConservadas = normalizarRutasConservadas(
      body.rutasConservadas,
      carpeta
    );

    if (!rutasConservadas.ok) {
      return responder(400, {
        error: rutasConservadas.error
      });
    }

    const { storage, bucketName } = crearClienteStorage();
    const bucket = storage.bucket(bucketName);
    const prefijo = `${carpeta}/`;
    const [objetos] = await bucket.getFiles({ prefix: prefijo });

    const multimediaDirecta = objetos
      .map((archivo) => ({
        archivo,
        categoria: obtenerCategoria(archivo)
      }))
      .filter(({ archivo, categoria }) => {
        const relativo = archivo.name.slice(prefijo.length);
        return Boolean(categoria && relativo && !relativo.includes("/") && !archivo.name.endsWith("/"));
      });

    const rutasExistentes = new Map(
      multimediaDirecta.map(({ archivo, categoria }) => [archivo.name, categoria])
    );

    for (const ruta of rutasConservadas.rutas) {
      if (!rutasExistentes.has(ruta)) {
        return responder(409, {
          error: `El archivo que se intentó conservar no existe en Storage: ${ruta}`
        });
      }
    }

    const categoriasConservadas = rutasConservadas.rutas.map((ruta) => rutasExistentes.get(ruta));
    const cantidadImagenes = categoriasConservadas.filter((tipo) => tipo === "imagen").length;
    const cantidadVideos = categoriasConservadas.filter((tipo) => tipo === "video").length;

    if (cantidadImagenes > MAX_IMAGES || cantidadVideos > MAX_VIDEOS) {
      return responder(400, {
        error: `La configuración final supera el máximo de ${MAX_IMAGES} imágenes o ${MAX_VIDEOS} videos.`
      });
    }

    const conjuntoConservado = new Set(rutasConservadas.rutas);
    const porEliminar = multimediaDirecta
      .map(({ archivo }) => archivo)
      .filter((archivo) => !conjuntoConservado.has(archivo.name));

    await Promise.all(
      porEliminar.map((archivo) => archivo.delete({ ignoreNotFound: true }))
    );

    return responder(200, {
      carpeta,
      conservados: rutasConservadas.rutas,
      eliminados: porEliminar.map((archivo) => archivo.name),
      cantidadImagenes,
      cantidadVideos
    });
  } catch (error) {
    console.error("Error finalizando la actualización:", error);

    return responder(500, {
      error: "No fue posible finalizar la actualización de la carpeta."
    });
  }
};

function normalizarRutasConservadas(valor, carpeta) {
  if (!Array.isArray(valor)) {
    return { ok: false, error: "Debes enviar el arreglo rutasConservadas." };
  }

  const prefijo = `${carpeta}/`;
  const rutas = [];
  const unicas = new Set();

  for (const rutaOriginal of valor) {
    if (typeof rutaOriginal !== "string") {
      return { ok: false, error: "Una de las rutas conservadas no es válida." };
    }

    const ruta = rutaOriginal.trim();
    const relativo = ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : "";

    if (!relativo || relativo.includes("/") || ruta.includes("..")) {
      return {
        ok: false,
        error: `La ruta no pertenece directamente a la carpeta ${carpeta}: ${ruta}`
      };
    }

    if (!unicas.has(ruta)) {
      unicas.add(ruta);
      rutas.push(ruta);
    }
  }

  return { ok: true, rutas };
}

function obtenerCategoria(archivo) {
  const contentType = String(archivo.metadata?.contentType || "").toLowerCase();

  if (contentType.startsWith("image/")) {
    return "imagen";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  const nombre = archivo.name.toLowerCase();
  const extensionesImagen = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg", ".heic", ".heif"];
  const extensionesVideo = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".3gp", ".3g2", ".mpeg", ".mpg"];

  if (extensionesImagen.some((extension) => nombre.endsWith(extension))) {
    return "imagen";
  }

  if (extensionesVideo.some((extension) => nombre.endsWith(extension))) {
    return "video";
  }

  return "";
}

function leerJson(event) {
  if (!event.body) {
    return {};
  }

  const texto = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  return JSON.parse(texto);
}

function crearClienteStorage() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const bucketName = process.env.GCS_BUCKET;

  if (!credentialsJson || !bucketName) {
    throw new Error("Faltan las variables de entorno del servidor.");
  }

  const credentials = JSON.parse(credentialsJson);
  const storage = new Storage({
    projectId: credentials.project_id,
    credentials
  });

  return { storage, bucketName };
}

function normalizarCarpeta(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const carpeta = valor.trim().replace(/^\/+|\/+$/g, "");
  return /^[a-zA-Z0-9_-]+$/.test(carpeta) ? carpeta : "";
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
