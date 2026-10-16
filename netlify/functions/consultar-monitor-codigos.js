const crypto = require("crypto");
const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "codigos";
const ESTADOS_PERMITIDOS = new Set(["disponible","reservado","dado","pendiente"]);
const MAX_RESULTADOS = 500;

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return responder(405, { error: "Método no permitido." }, { Allow: "POST" });
  }

  try {
    const body = leerJson(event);
    const accion = typeof body.accion === "string" ? body.accion.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) return responder(400, { error: "Falta la contraseña." });
    if (!validarPassword(password)) return responder(401, { error: "La contraseña no es correcta." });

    if (accion === "validar") return responder(200, { ok: true });
    if (accion === "contar-bucket-ar") {
      const codigoBucket = normalizarCodigoBucket(body.codigo);
      if (!codigoBucket) {
        return responder(400, { error: "Escribe un Código válido (1 a 36 letras, números, _ o -)." });
      }
      const { carpeta, totalArchivos } = await contarArchivosBucketAr(codigoBucket);
      return responder(200, { ok: true, carpeta, totalArchivos });
    }
    if (accion !== "consultar") return responder(400, { error: "La acción solicitada no es válida." });

    const codigo = normalizarCodigo(body.codigo);
    const estado = normalizarEstado(body.estado);
    const nombre = normalizarNombre(body.nombre);

    if (typeof body.estado === "string" && body.estado.trim() && !estado) {
      return responder(400, { error: "El estado recibido no es válido." });
    }
    if (body.codigo != null && typeof body.codigo !== "string") {
      return responder(400, { error: "El Código recibido no es válido." });
    }
    if (typeof body.codigo === "string" && body.codigo.trim() && !codigo) {
      return responder(400, { error: "El Código debe contener solo letras, números, guiones o guiones bajos." });
    }

    const firestore = crearClienteFirestore();
    let consulta = firestore.collection(FIRESTORE_COLLECTION);

    if (codigo) {
      // El Código es el sufijo de la URL, no el ID del documento de Firestore.
      // El mismo dominio puede haberse guardado en Unicode o en formato Punycode.
      consulta = consulta.where("url", "in", [
        `https://ú.ws/${codigo}`,
        `https://xn--rda.ws/${codigo}`
      ]);
    } else if (estado) {
      consulta = consulta.where("estado", "==", estado);
    } else if (nombre) {
      consulta = consulta.where("nombre", "==", nombre);
    }

    const snapshot = await consulta.limit(MAX_RESULTADOS).get();

    let resultados = snapshot.docs.map(documento => {
      const datos = documento.data() || {};
      return {
        codigo: documento.id,
        nombre: texto(datos.nombre),
        estado: texto(datos.estado),
        fecha: serializarFecha(datos.fecha),
        url: texto(datos.url)
      };
    });

    // Al buscar por URL, combinar Estado y Nombre sin requerir índices compuestos.
    if (estado && (codigo || nombre)) {
      resultados = resultados.filter(item => item.estado === estado);
    }
    if (nombre && (codigo || estado)) {
      resultados = resultados.filter(item => item.nombre === nombre);
    }

    resultados.sort((a,b) => a.codigo.localeCompare(b.codigo,"es",{numeric:true,sensitivity:"base"}));

    return responder(200, { ok: true, resultados });
  } catch (error) {
    console.error("Error consultar-monitor-codigos:", error?.message || error);
    if (Number.isInteger(error?.statusCode)) return responder(error.statusCode, { error: error.message });
    return responder(500, { error: "No fue posible consultar los códigos." });
  }
};

function validarPassword(passwordIngresado) {
  const passwordConfigurado = process.env.LIST_UPDATED_PASSWORD;
  if (!passwordConfigurado) throw new Error("Falta LIST_UPDATED_PASSWORD.");

  const a = crypto.createHash("sha256").update(passwordIngresado, "utf8").digest();
  const b = crypto.createHash("sha256").update(passwordConfigurado, "utf8").digest();

  return crypto.timingSafeEqual(a, b);
}

// Solo permite nombres de carpeta compatibles con guardar-qr-ar.js.
function normalizarCodigoBucket(valor) {
  if (typeof valor !== "string") return "";
  const codigo = valor.trim();
  return /^[a-zA-Z0-9_-]{1,36}$/.test(codigo) ? codigo : "";
}

async function contarArchivosBucketAr(codigo) {
  const credentials = obtenerCredencialesGoogle();
  const nombreBucket = process.env.GCS_BUCKET;
  if (!nombreBucket) {
    const error = new Error("Falta la variable GCS_BUCKET en Netlify.");
    error.statusCode = 503;
    throw error;
  }

  const bucket = new Storage({ projectId: credentials.project_id, credentials }).bucket(nombreBucket);
  const carpeta = `${codigo}_ar`;
  const prefijo = `${carpeta}/`;
  let totalArchivos = 0;
  let pageToken;

  // Sin archivos de subcarpetas; omite el objeto marcador de la propia carpeta.
  // La paginación permite obtener el total exacto aun cuando hay muchos archivos.
  do {
    const opciones = { prefix: prefijo, delimiter: "/", maxResults: 1000, autoPaginate: false };
    if (pageToken) opciones.pageToken = pageToken;
    const [archivos, siguienteConsulta] = await bucket.getFiles(opciones);
    totalArchivos += archivos.filter(archivo => archivo.name !== prefijo && !archivo.name.endsWith("/")).length;
    pageToken = siguienteConsulta?.pageToken || undefined;
  } while (pageToken);

  return { carpeta, totalArchivos };
}

function normalizarCodigo(valor) {
  if (typeof valor !== "string") return "";
  const codigo = valor.trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(codigo) ? codigo : "";
}

function normalizarEstado(valor) {
  if (typeof valor !== "string") return "";
  const estado = valor.trim().toLowerCase();
  if (!estado) return "";
  return ESTADOS_PERMITIDOS.has(estado) ? estado : "";
}

function normalizarNombre(valor) {
  if (typeof valor !== "string") return "";
  return valor.trim().slice(0, 120);
}

function texto(valor) {
  return typeof valor === "string" ? valor : "";
}

function serializarFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") {
    const f = valor.toDate();
    return Number.isNaN(f.getTime()) ? null : f.toISOString();
  }
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  if (typeof valor === "string") {
    const f = new Date(valor);
    return Number.isNaN(f.getTime()) ? null : f.toISOString();
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
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON.");
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido."); }

  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("Las credenciales de Google no contienen los campos requeridos.");
  }
  return credentials;
}

function leerJson(event) {
  if (!event.body) return {};
  const contenido = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try { return JSON.parse(contenido); }
  catch {
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
