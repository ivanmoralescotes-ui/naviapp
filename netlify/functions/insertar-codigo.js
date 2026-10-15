"use strict";

const crypto = require("node:crypto");
const { Firestore } = require("@google-cloud/firestore");

const PROJECT_ID = "qrpro-f4709";
const COLECCION = "codigos";
const INDICES_UNICOS = "codigos_unicos_control";

function responder(statusCode, datos) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(datos)
  };
}

function errorHTTP(codigo, mensaje) {
  const error = new Error(mensaje);
  error.statusCode = codigo;
  return error;
}

function leerCuerpo(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");
  if (Buffer.byteLength(raw, "utf8") > 16000) throw errorHTTP(413, "La solicitud es demasiado grande.");
  try {
    const valor = JSON.parse(raw);
    if (!valor || Array.isArray(valor) || typeof valor !== "object") throw Error();
    return valor;
  } catch (_) {
    throw errorHTTP(400, "La solicitud no contiene un JSON válido.");
  }
}

function validarPassword(valor) {
  const secreto = process.env.LIST_UPDATED_PASSWORD;
  if (!secreto) throw errorHTTP(503, "Falta la configuración de acceso en Netlify.");
  if (typeof valor !== "string" || !valor || valor.length > 200) return false;
  const a = crypto.createHash("sha256").update(valor, "utf8").digest();
  const b = crypto.createHash("sha256").update(secreto, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function validarEntrada(body) {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const ruta = typeof body.ruta === "string" ? body.ruta.trim() : "";
  const urlIngresada = typeof body.url === "string" ? body.url.trim() : "";

  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(nombre)) {
    throw errorHTTP(400, "Nombre inválido. Utiliza entre 1 y 120 letras, números, guiones o guiones bajos.");
  }
  if (!/^\/imgs\/qr\/[a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|gif|webp|svg|avif)$/i.test(ruta) || ruta.includes("..")) {
    throw errorHTTP(400, "La ruta debe ser /imgs/qr/ seguida del nombre de un archivo de imagen válido.");
  }

  let parsed;
  try { parsed = new URL(urlIngresada); }
  catch (_) { throw errorHTTP(400, "La URL no es válida."); }

  if (parsed.protocol !== "https:" || parsed.hostname !== "xn--rda.ws" ||
      parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !/^\/[a-zA-Z0-9_-]{3}$/.test(parsed.pathname)) {
    throw errorHTTP(400, "La URL debe tener el formato https://ú.ws/codigo, con un identificador de tres caracteres y sin parámetros.");
  }

  const id = parsed.pathname.slice(1);
  const url = `https://ú.ws/${id}`;
  return { id, nombre, ruta, url };
}

function firestore() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw errorHTTP(503, "Faltan las credenciales de Google Cloud.");
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch (_) { throw errorHTTP(503, "Las credenciales de Google Cloud no son válidas."); }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw errorHTTP(503, "Las credenciales de Google Cloud están incompletas.");
  }
  return new Firestore({ projectId: PROJECT_ID, credentials });
}

function idIndice(tipo, valor) {
  return crypto.createHash("sha256").update(tipo + "\u0000" + valor, "utf8").digest("hex");
}

async function insertarSinDuplicados(db, dato) {
  const coleccion = db.collection(COLECCION);
  const ref = coleccion.doc(dato.id);
  const indices = db.collection(INDICES_UNICOS);
  const indicesRef = [
    indices.doc(idIndice("nombre", dato.nombre.toLowerCase())),
    indices.doc(idIndice("ruta", dato.ruta)),
    indices.doc(idIndice("url", dato.id.toLowerCase()))
  ];
  const variantesURL = [dato.url, `https://xn--rda.ws/${dato.id}`];
  const variantesNombre = [...new Set([dato.nombre, dato.nombre.toUpperCase(), dato.nombre.toLowerCase()])];

  return db.runTransaction(async (tx) => {
    // Todas las lecturas antes de las escrituras, requisito de Firestore.
    const [actual, marcadores, porNombre, porRuta, porURL] = await Promise.all([
      tx.get(ref),
      Promise.all(indicesRef.map((r) => tx.get(r))),
      tx.get(coleccion.where("nombre", "in", variantesNombre).limit(1)),
      tx.get(coleccion.where("ruta", "==", dato.ruta).limit(1)),
      tx.get(coleccion.where("url", "in", variantesURL).limit(1))
    ]);

    if (actual.exists) throw errorHTTP(409, `El ID "${dato.id}" ya existe en codigos.`);
    if (marcadores.some((m) => m.exists)) {
      throw errorHTTP(409, "Ya se registró este nombre, ruta o URL desde este formulario.");
    }
    if (!porNombre.empty) throw errorHTTP(409, `El nombre "${dato.nombre}" ya existe.`);
    if (!porRuta.empty) throw errorHTTP(409, `La ruta "${dato.ruta}" ya existe.`);
    if (!porURL.empty) throw errorHTTP(409, `La URL "${dato.url}" ya existe.`);

    const fecha = new Date();
    tx.create(ref, {
      nombre: dato.nombre,
      estado: "pendiente",
      fecha,
      ruta: dato.ruta,
      url: dato.url
    });
    // Marcadores transaccionales: impiden que dos peticiones desde este formulario
    // creen simultáneamente valores repetidos bajo IDs diferentes.
    for (let i = 0; i < indicesRef.length; i++) {
      tx.create(indicesRef[i], { codigoId: dato.id, tipo: ["nombre", "ruta", "url"][i] });
    }
    return fecha.toISOString();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return responder(405, { error: "Método no permitido." });
  try {
    const body = leerCuerpo(event);
    if (!validarPassword(body.password)) return responder(401, { error: "La contraseña no es correcta." });

    if (body.accion === "validar") return responder(200, { ok: true });
    if (body.accion !== "crear") return responder(400, { error: "Acción no permitida." });

    const dato = validarEntrada(body);
    const fecha = await insertarSinDuplicados(firestore(), dato);
    return responder(201, { ok: true, id: dato.id, nombre: dato.nombre, ruta: dato.ruta, url: dato.url, estado: "pendiente", fecha });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) return responder(error.statusCode, { error: error.message });
    // Firestore ALREADY_EXISTS (crear el mismo ID durante una carrera).
    if (error?.code === 6 || error?.code === "already-exists") {
      return responder(409, { error: "El código o uno de sus valores ya existe." });
    }
    console.error("Error creando código QR:", error);
    return responder(500, { error: "No se pudo guardar el código. Revisa el registro de Netlify." });
  }
};
