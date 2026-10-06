const crypto = require("crypto");
const { Firestore, Timestamp } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(405, { error: "Método no permitido." }, { Allow: "POST" });
  }

  try {
    const body = leerJson(event);
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) return responder(400, { error: "Falta la contraseña." });
    if (!validarPassword(password)) return responder(401, { error: "La contraseña no es correcta." });

    const codigo = extraerCodigo(body.codigo);
    if (!codigo) {
      return responder(400, { error: "El código debe tener exactamente 3 caracteres válidos." });
    }

    const firestore = crearClienteFirestore();
    const documentoId = `prop${codigo}`;
    const documentoRef = firestore.collection(FIRESTORE_COLLECTION).doc(documentoId);

    const datos = {
      akey: "",
      clave: 1539232,
      images: [],
      instagram: "",
      isEnglish: "no",
      lastupdate: Timestamp.now(),
      linkdirecto: "",
      linkpublicidad: "",
      motivacional: "no",
      nombre: "",
      nombrepublicidad: "",
      numerosuerte: "no",
      palabras: "",
      segundosslide: "4",
      spotify: "",
      tipoIa: "",
      versiculo: "no",
      whatsapp: "",
      ordenArchivosStorage: []
    };

    try {
      // create() evita sobrescribir un documento existente.
      await documentoRef.create(datos);
    } catch (error) {
      if (esDocumentoExistente(error)) {
        return responder(200, { ok: true, creado: false, mensaje: "ya existia" });
      }
      throw error;
    }

    return responder(201, { ok: true, creado: true, codigo, id: documentoId });
  } catch (error) {
    console.error("Error crear-configg:", error?.message || error);
    if (Number.isInteger(error?.statusCode)) return responder(error.statusCode, { error: error.message });
    return responder(500, { error: "No fue posible crear la configuración." });
  }
};

function validarPassword(passwordIngresado) {
  const passwordConfigurado = process.env.LIST_UPDATED_PASSWORD;
  if (!passwordConfigurado) throw new Error("Falta la variable de entorno LIST_UPDATED_PASSWORD.");

  const a = crypto.createHash("sha256").update(passwordIngresado, "utf8").digest();
  const b = crypto.createHash("sha256").update(passwordConfigurado, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function extraerCodigo(valor) {
  if (typeof valor !== "string") return "";
  const texto = valor.trim();
  if (!texto) return "";

  let candidato = texto;
  const coincidenciaUrl = texto.match(/https?:\/\/(?:ú\.ws|xn--rda\.ws)\/([^\)\]\s?#/]+)/iu);
  if (coincidenciaUrl) candidato = coincidenciaUrl[1];

  try { candidato = decodeURIComponent(candidato); } catch { return ""; }
  candidato = candidato.trim();

  if (Array.from(candidato).length !== 3) return "";
  if (!/^[\p{L}\p{N}_~-]{3}$/u.test(candidato)) return "";
  return candidato;
}

function esDocumentoExistente(error) {
  return error?.code === 6 || error?.code === "6" || error?.code === "already-exists" || error?.code === "ALREADY_EXISTS";
}

function crearClienteFirestore() {
  return new Firestore({ projectId: FIRESTORE_PROJECT_ID, credentials: obtenerCredencialesGoogle() });
}

function obtenerCredencialesGoogle() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error("Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON.");
  try { return JSON.parse(credentialsJson); }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido."); }
}

function leerJson(event) {
  if (!event.body) return {};
  const contenido = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try { return JSON.parse(contenido); }
  catch {
    const error = new Error("JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

function responder(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
    body: JSON.stringify(body)
  };
}
