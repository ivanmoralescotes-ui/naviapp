"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { Storage } = require("@google-cloud/storage");

// Se reutilizan las mismas variables de entorno que ya utiliza monitor.html
// y las funciones de subida de config1.html.
const MAX_BYTES = 27 * 1024 * 1024;
const TIPOS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
  ["image/bmp", ".bmp"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"]
]);
const EXT_A_TIPO = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"]
]);

function respuesta(statusCode, payload, extra = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra
    },
    body: JSON.stringify(payload)
  };
}

function errorHttp(mensaje, codigo) {
  const error = new Error(mensaje);
  error.statusCode = codigo;
  return error;
}

function leerBody(event) {
  if (!event.body) return {};
  try {
    const texto = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(texto);
  } catch (_) {
    throw errorHttp("Los datos enviados no son JSON válido.", 400);
  }
}

// Misma comparación SHA-256 y timingSafeEqual de consultar-monitor-codigos.js.
function validarClaveMonitor(clave) {
  const claveConfigurada = process.env.LIST_UPDATED_PASSWORD;
  if (!claveConfigurada) throw new Error("Falta LIST_UPDATED_PASSWORD.");
  if (typeof clave !== "string") return false;
  const a = crypto.createHash("sha256").update(clave, "utf8").digest();
  const b = crypto.createHash("sha256").update(claveConfigurada, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function validarCodigo(valor) {
  if (typeof valor !== "string") throw errorHttp("Escribe un código válido.", 400);
  const codigo = valor.trim();
  // Compatible con la convención de carpetas de config1: letras, números, _ y -.
  // Sin barras, puntos, espacios ni rutas relativas.
  if (!/^[a-zA-Z0-9_-]{1,36}$/.test(codigo)) {
    throw errorHttp("El código solo puede contener letras, números, guion y guion bajo (máximo 36 caracteres).", 400);
  }
  return codigo;
}

function validarArchivo(datos) {
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  const tamano = Number(datos.tamanoBytes);
  if (!nombre || nombre.length > 255 || !Number.isSafeInteger(tamano) || tamano < 1 || tamano > MAX_BYTES) {
    throw errorHttp("Selecciona una imagen válida de hasta 27 MB.", 400);
  }

  const basename = path.posix.basename(nombre.replace(/\\/g, "/"));
  const extensionOriginal = path.extname(basename).toLowerCase();
  const tipoDeclarado = typeof datos.tipo === "string" ? datos.tipo.toLowerCase().trim() : "";
  const tipo = tipoDeclarado || EXT_A_TIPO.get(extensionOriginal);
  if (!TIPOS.has(tipo)) throw errorHttp("Formato no permitido. Usa JPG, PNG, WEBP, GIF, AVIF, BMP, HEIC o HEIF.", 400);

  // No dejar que una extensión de video, script o SVG quede guardada como imagen.
  if (extensionOriginal && !EXT_A_TIPO.has(extensionOriginal)) {
    throw errorHttp("La extensión del archivo no corresponde a una imagen permitida.", 400);
  }
  if (extensionOriginal && EXT_A_TIPO.get(extensionOriginal) !== tipo) {
    throw errorHttp("El formato de la imagen no coincide con su extensión.", 400);
  }

  const nombreBase = path.basename(basename, extensionOriginal)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "imagen";

  return { tipo, extension: extensionOriginal || TIPOS.get(tipo), nombreBase };
}

function crearBucket() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const nombreBucket = process.env.GCS_BUCKET;
  if (!raw || !nombreBucket) throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_JSON o GCS_BUCKET.");
  const credenciales = JSON.parse(raw);
  if (!credenciales.project_id || !credenciales.client_email || !credenciales.private_key) {
    throw new Error("Las credenciales de GCS están incompletas.");
  }
  const storage = new Storage({ projectId: credenciales.project_id, credentials: credenciales });
  return storage.bucket(nombreBucket);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return respuesta(405, { error: "Método no permitido." }, { Allow: "POST" });
  try {
    const body = leerBody(event);
    if (!validarClaveMonitor(body.password)) return respuesta(401, { error: "La contraseña no es correcta." });

    if (body.accion === "validar") return respuesta(200, { ok: true });
    if (body.accion !== "preparar") return respuesta(400, { error: "Acción no válida." });

    const codigo = validarCodigo(body.codigo);
    const archivo = validarArchivo(body.archivo || {});
    const carpeta = `${codigo}_ar`;
    const bucket = crearBucket();

    // En Google Cloud Storage las carpetas son prefijos, no directorios físicos.
    // Al crear el primer objeto 'codigo_ar/archivo', la carpeta aparece automáticamente.
    const [objetosExistentes] = await bucket.getFiles({ prefix: `${carpeta}/`, maxResults: 1 });
    const carpetaExistia = objetosExistentes.length > 0;

    const sufijo = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const nombre = `${Date.now()}-${sufijo}-${archivo.nombreBase}${archivo.extension}`;
    const ruta = `${carpeta}/${nombre}`;
    const destino = bucket.file(ruta);

    // Permiso temporal para subir ÚNICAMENTE este objeto. No da permisos de listar,
    // descargar ni borrar otros archivos del bucket.
    const [urlSubida] = await destino.getSignedUrl({
      version: "v4",
      action: "write",
      contentType: archivo.tipo,
      expires: Date.now() + 10 * 60 * 1000
    });

    return respuesta(200, {
      ok: true,
      carpeta,
      carpetaExistia,
      ruta,
      tipo: archivo.tipo,
      urlSubida,
      expiracionMinutos: 10
    });
  } catch (error) {
    console.error("Error guardar-qr-ar:", error);
    if (Number.isInteger(error.statusCode)) return respuesta(error.statusCode, { error: error.message });
    return respuesta(500, { error: "No se pudo preparar la subida. Revisa los registros de Netlify." });
  }
};
