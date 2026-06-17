const crypto = require("crypto");
const path = require("path");
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

    const archivosNuevos = Array.isArray(body.archivosNuevos)
      ? body.archivosNuevos
      : [];

    const validacion = validarArchivosNuevos(archivosNuevos);

    if (!validacion.ok) {
      return responder(400, {
        error: validacion.error
      });
    }

    const { storage, bucketName } = crearClienteStorage();
    const bucket = storage.bucket(bucketName);
    const ahora = Date.now();

    const subidas = await Promise.all(
      archivosNuevos.map(async (item, indice) => {
        const nombreOriginal = item.nombre.trim();
        const tipo = item.tipo.trim().toLowerCase();
        const nombreSeguro = crearNombreSeguro(nombreOriginal);
        const identificador = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
        const nombreGuardado = `${ahora + indice}-${identificador}-${nombreSeguro}`;
        const ruta = `${carpeta}/${nombreGuardado}`;
        const archivo = bucket.file(ruta);

        const [urlSubida] = await archivo.getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: tipo
        });

        return {
          indice,
          nombreOriginal,
          nombreGuardado,
          ruta,
          tipo,
          categoria: obtenerCategoriaMime(tipo),
          tamanoBytes: Number(item.tamanoBytes),
          urlSubida,
          headers: {
            "Content-Type": tipo
          }
        };
      })
    );

    return responder(200, {
      carpeta,
      expiracionMinutos: 15,
      subidas
    });
  } catch (error) {
    console.error("Error preparando la actualización:", error);

    return responder(500, {
      error: "No fue posible preparar la subida de los archivos."
    });
  }
};

function validarArchivosNuevos(archivos) {
  if (archivos.length > MAX_IMAGES + MAX_VIDEOS) {
    return {
      ok: false,
      error: `No puedes subir más de ${MAX_IMAGES} imágenes y ${MAX_VIDEOS} videos.`
    };
  }

  let imagenes = 0;
  let videos = 0;

  for (const item of archivos) {
    if (!item || typeof item.nombre !== "string" || !item.nombre.trim()) {
      return { ok: false, error: "Uno de los archivos no tiene un nombre válido." };
    }

    if (typeof item.tipo !== "string") {
      return { ok: false, error: `El archivo ${item.nombre} no tiene un tipo válido.` };
    }

    const categoria = obtenerCategoriaMime(item.tipo);

    if (!categoria) {
      return {
        ok: false,
        error: `El archivo ${item.nombre} no es una imagen ni un video permitido.`
      };
    }

    const tamano = Number(item.tamanoBytes);

    if (!Number.isFinite(tamano) || tamano <= 0) {
      return {
        ok: false,
        error: `El tamaño del archivo ${item.nombre} no es válido.`
      };
    }

    if (categoria === "imagen") {
      imagenes += 1;
    } else {
      videos += 1;
    }
  }

  if (imagenes > MAX_IMAGES) {
    return { ok: false, error: `Solo puedes subir un máximo de ${MAX_IMAGES} imágenes nuevas.` };
  }

  if (videos > MAX_VIDEOS) {
    return { ok: false, error: `Solo puedes subir un máximo de ${MAX_VIDEOS} videos nuevos.` };
  }

  return { ok: true };
}

function crearNombreSeguro(nombreOriginal) {
  const extensionOriginal = path.extname(nombreOriginal).toLowerCase();
  const baseOriginal = path.basename(nombreOriginal, extensionOriginal);

  const baseSegura = baseOriginal
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "archivo";

  const extensionSegura = /^\.[a-zA-Z0-9]{1,10}$/.test(extensionOriginal)
    ? extensionOriginal
    : "";

  return `${baseSegura}${extensionSegura}`;
}

function obtenerCategoriaMime(tipo) {
  const valor = String(tipo || "").toLowerCase();

  if (valor.startsWith("image/")) {
    return "imagen";
  }

  if (valor.startsWith("video/")) {
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
