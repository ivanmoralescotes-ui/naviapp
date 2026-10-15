const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "codigos";
const RUTA_PERMITIDA = "/imgs/qr/";
const RUTA_EN_BUCKET = "bucketqr";
const DURACION_URL_FIRMADA_MS = 60 * 60 * 1000;
const CONSULTAS_STORAGE_PARALELAS = 6;
const EXTENSIONES_IMAGEN = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif",
  ".bmp", ".heic", ".heif"
]);

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "GET") {
      return await listarDisponibles();
    }

    if (event.httpMethod === "POST") {
      return await reservarCodigo(event);
    }

    return responder(405, { error: "Método no permitido." }, { Allow: "GET, POST" });
  } catch (error) {
    console.error("Error en codigos-qr:", error?.message || error);

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, { error: error.message });
    }

    return responder(500, {
      error: "No fue posible procesar la solicitud."
    });
  }
};

async function listarDisponibles() {
  const firestore = crearClienteFirestore();

  const snapshot = await firestore
    .collection(FIRESTORE_COLLECTION)
    .where("estado", "==", "disponible")
    .get();

  const candidatos = snapshot.docs.map((documento) => ({
    id: documento.id,
    datos: documento.data() || {}
  }));

  // Las rutas locales mantienen su comportamiento. Solo la cadena exacta
  // "bucketqr" necesita buscar una imagen en Cloud Storage.
  const necesitaBucket = candidatos.some(({ datos }) => datos.ruta === RUTA_EN_BUCKET);
  const bucket = necesitaBucket ? crearBucketImagenes() : null;
  const resultados = new Array(candidatos.length);

  // Limita las consultas de Storage simultáneas si el catálogo crece.
  let siguiente = 0;
  const trabajadores = Array.from(
    { length: Math.min(CONSULTAS_STORAGE_PARALELAS, candidatos.length) },
    async () => {
      while (siguiente < candidatos.length) {
        const indice = siguiente++;
        const { id, datos } = candidatos[indice];
        const ruta = await resolverRutaImagen(datos, bucket);
        if (ruta) {
          resultados[indice] = {
            id,
            nombre: normalizarNombre(datos.nombre, id),
            ruta
          };
        }
      }
    }
  );
  await Promise.all(trabajadores);

  const codigos = resultados
    .filter(Boolean)
    .sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", {
        numeric: true,
        sensitivity: "base"
      }) || a.id.localeCompare(b.id, "es", {
        numeric: true,
        sensitivity: "base"
      })
    );

  return responder(200, { codigos });
}

async function reservarCodigo(event) {
  const body = leerJson(event);
  const id = normalizarId(body.id);

  if (!id) {
    throw crearError(400, "El código recibido no es válido.");
  }

  const firestore = crearClienteFirestore();
  const documentoRef = firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(id);

  let resultado = null;

  await firestore.runTransaction(async (transaccion) => {
    const documento = await transaccion.get(documentoRef);

    if (!documento.exists) {
      throw crearError(404, "El código solicitado no existe.");
    }

    const datos = documento.data() || {};
    const estado = typeof datos.estado === "string"
      ? datos.estado.trim().toLowerCase()
      : "";

    if (estado !== "disponible") {
      throw crearError(409, "Este código ya no está disponible.");
    }

    // También en la reserva se comprueba que siga existiendo una imagen
    // cuando la ruta del QR apunta a bucketqr.
    const bucket = datos.ruta === RUTA_EN_BUCKET ? crearBucketImagenes() : null;
    const ruta = await resolverRutaImagen(datos, bucket);

    if (!ruta) {
      throw crearError(
        409,
        "Este código no tiene una imagen válida disponible."
      );
    }

    transaccion.update(documentoRef, {
      estado: "reservado",
      fecha: new Date()
    });

    resultado = {
      id: documento.id,
      nombre: normalizarNombre(datos.nombre, documento.id),
      ruta,
      estado: "reservado"
    };
  });

  return responder(200, {
    reservado: true,
    codigo: resultado
  });
}

// Devuelve una URL para mostrar la imagen, o "" si no hay imagen.
async function resolverRutaImagen(datos, bucket) {
  if (datos.ruta !== RUTA_EN_BUCKET) {
    return normalizarRuta(datos.ruta);
  }

  const codigo = codigoDesdeUrl(datos.url);
  if (!codigo) return "";

  const prefijo = `${codigo}_ar/`;
  const [archivos] = await bucket.getFiles({ prefix: prefijo });

  // Ignora carpetas vacías, marcadores de directorio, archivos que no sean
  // imágenes y archivos dentro de subcarpetas. El primero se determina por
  // el nombre completo ascendente (en el formato del cargador, el más antiguo).
  const primeraImagen = archivos
    .filter((archivo) => {
      if (!archivo.name.startsWith(prefijo)) return false;
      const nombre = archivo.name.slice(prefijo.length);
      if (!nombre || nombre.includes("/")) return false;
      const extension = nombre.match(/\.[^.]+$/)?.[0].toLowerCase() || "";
      return EXTENSIONES_IMAGEN.has(extension);
    })
    .sort((a, b) => a.name.localeCompare(b.name))[0];

  // Si no existe la carpeta o está vacía, el código no se muestra.
  if (!primeraImagen) return "";

  // Bucket privado: no se expone la clave de servicio al navegador.
  // La URL temporal permite que codigos.html la utilice directamente como src.
  const [urlFirmada] = await primeraImagen.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + DURACION_URL_FIRMADA_MS
  });
  return urlFirmada;
}

function codigoDesdeUrl(valor) {
  if (typeof valor !== "string") return "";
  try {
    const url = new URL(valor);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "xn--rda.ws" ||
      url.port || url.username || url.password || url.search || url.hash
    ) return "";
    // Mismo identificador de carpeta admitido por guardar-qr-ar.html.
    const partes = url.pathname.split("/").filter(Boolean);
    if (partes.length !== 1) return "";
    const codigo = partes[0];
    return /^[a-zA-Z0-9_-]{1,36}$/.test(codigo) ? codigo : "";
  } catch (_) {
    return "";
  }
}

function crearBucketImagenes() {
  const nombreBucket = process.env.GCS_BUCKET;
  if (!nombreBucket) {
    throw new Error("Falta GCS_BUCKET, usada también por guardar-qr-ar.js.");
  }
  const credenciales = obtenerCredencialesGoogle();
  const storage = new Storage({
    projectId: credenciales.project_id,
    credentials: credenciales
  });
  return storage.bucket(nombreBucket);
}

function normalizarId(valor) {
  if (typeof valor !== "string") return "";
  const id = valor.trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : "";
}

function normalizarNombre(valor, id) {
  if (typeof valor !== "string") return id;
  const nombre = valor.trim();
  return nombre ? nombre.slice(0, 120) : id;
}

function normalizarRuta(valor) {
  if (typeof valor !== "string") return "";

  const ruta = valor.trim();

  if (!ruta.startsWith(RUTA_PERMITIDA)) return "";
  if (ruta.includes("..")) return "";
  if (ruta.includes("\\") || ruta.includes("?") || ruta.includes("#")) return "";

  const resto = ruta.slice(RUTA_PERMITIDA.length);

  if (
    !resto ||
    resto.includes("/") ||
    !/^[a-zA-Z0-9._%()\- ]{1,220}$/.test(resto)
  ) {
    return "";
  }

  return ruta;
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
    throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  let credentials;

  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido.");
  }

  if (
    !credentials.project_id ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Las credenciales de Google no contienen los campos requeridos.");
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
    throw crearError(400, "El cuerpo de la solicitud no contiene JSON válido.");
  }
}

function crearError(statusCode, mensaje) {
  const error = new Error(mensaje);
  error.statusCode = statusCode;
  return error;
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
