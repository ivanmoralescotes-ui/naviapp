"use strict";

// QRegalo: consulta y asignación de clave en dos pasos con sesión admin Firebase.
// No utilizar la contraseña del monitor ni modificar datos desde el navegador.
const { bd, json, verificarAdmin } = require("../lib/qregalo-comun");

const COLECCION_CODIGOS = "codigos";
const COLECCION_CONFIG = "configg";

function carpetaDeUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const normalizada = new URL(url.trim());
    if (!/^(http:|https:)$/.test(normalizada.protocol)) return "";
    const partes = normalizada.pathname.split("/").filter(Boolean);
    const final = partes.length ? partes[partes.length - 1] : "";
    const carpeta = decodeURIComponent(final).slice(-3);
    return /^[a-zA-Z0-9_-]{3}$/.test(carpeta) ? carpeta : "";
  } catch (_) {
    return "";
  }
}

// Igual al método simpleStringHash() usado en asignar-clave-configuracion.js.
function simpleStringHash(valor) {
  let hash = 0;
  for (let i = 0; i < valor.length; i++) {
    hash = (hash << 5) - hash + valor.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function codigoConfiguracion(carpeta) {
  return `ccW${Buffer.from(carpeta, "utf8").toString("base64")}i`;
}

function errorEstado(statusCode, mensaje) {
  const e = new Error(mensaje);
  e.statusCode = statusCode;
  return e;
}

function validarNombre(nombre) {
  if (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 120) {
    throw errorEstado(400, "Escribe un nombre de QR válido en el campo Código.");
  }
  return nombre.trim();
}

function validarClave(claveNueva) {
  if (typeof claveNueva !== "string" || claveNueva !== claveNueva.trim() ||
      claveNueva.length < 3 || claveNueva.length > 20) {
    throw errorEstado(400, "La clave debe contener entre 3 y 20 caracteres, sin espacios al principio o al final.");
  }
  return claveNueva;
}

function infoDocumento(documento) {
  const datos = documento.data() || {};
  const url = typeof datos.url === "string" ? datos.url.trim() : "";
  const carpeta = carpetaDeUrl(url);
  if (!carpeta) {
    throw errorEstado(409, "El código encontrado no tiene una URL válida con una carpeta de tres caracteres.");
  }
  return {
    nombre: datos.nombre,
    idCodigo: documento.id,
    estado: typeof datos.estado === "string" && datos.estado.trim()
      ? datos.estado.trim() : "(sin estado)",
    url,
    carpeta,
    documentoConfig: `prop${carpeta}`,
    codigoConfig: codigoConfiguracion(carpeta)
  };
}

async function buscarUnico(db, nombre, transaccion = null) {
  const consulta = db.collection(COLECCION_CODIGOS)
    .where("nombre", "==", nombre)
    .limit(2);
  const resultado = transaccion ? await transaccion.get(consulta) : await consulta.get();
  if (resultado.empty) {
    throw errorEstado(404, `No se encontró en codigos ningún documento cuyo nombre sea "${nombre}".`);
  }
  if (resultado.size !== 1) {
    throw errorEstado(409, `Hay varios documentos en codigos con nombre "${nombre}". Corrige el duplicado antes de asignar la clave.`);
  }
  return infoDocumento(resultado.docs[0]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });
  const autorizado = await verificarAdmin(event);
  if (autorizado.error) return json(autorizado.status, { error: autorizado.error });

  let body;
  try { body = JSON.parse(event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "{}")); }
  catch (_) { return json(400, { error: "JSON inválido" }); }

  try {
    const nombre = validarNombre(body.nombre);
    const db = bd();

    if (body.accion === "consultar") {
      const encontrado = await buscarUnico(db, nombre);
      const documento = await db.collection(COLECCION_CONFIG).doc(encontrado.documentoConfig).get();
      if (!documento.exists) {
        throw errorEstado(404, `Se encontró "${nombre}", pero no existe ${encontrado.documentoConfig} en configg.`);
      }
      return json(200, { ok: true, ...encontrado });
    }

    if (body.accion === "confirmar") {
      const claveNueva = validarClave(body.claveNueva);
      // Evita que una selección anterior o manipulada sirva para actualizar otro QR.
      const idPrevio = String(body.idCodigo || "");
      const urlPrevia = String(body.urlEsperada || "");
      const docPrevio = String(body.documentoConfig || "");
      if (!idPrevio || !urlPrevia || !docPrevio) {
        throw errorEstado(400, "Faltan datos de la confirmación. Vuelve a pulsar asignarClave.");
      }

      const actualizado = await db.runTransaction(async (t) => {
        const actual = await buscarUnico(db, nombre, t);
        if (actual.idCodigo !== idPrevio || actual.url !== urlPrevia || actual.documentoConfig !== docPrevio) {
          throw errorEstado(409, "El QR o su URL cambió desde la consulta. Vuelve a verificarlo antes de confirmar.");
        }
        const refConfig = db.collection(COLECCION_CONFIG).doc(actual.documentoConfig);
        const documentoConfig = await t.get(refConfig);
        if (!documentoConfig.exists) {
          throw errorEstado(404, `Ya no existe ${actual.documentoConfig} en configg. No se cambió ninguna clave.`);
        }
        t.update(refConfig, { clave: simpleStringHash(claveNueva) });
        return actual;
      });

      console.log("QRegalo: clave asignada desde el panel:", actualizado.documentoConfig);
      return json(200, { ok: true, actualizado: true,
        documentoConfig: actualizado.documentoConfig,
        codigoConfig: actualizado.codigoConfig,
        url: actualizado.url });
    }

    return json(400, { error: "Acción inválida" });
  } catch (error) {
    if (error.statusCode) return json(error.statusCode, { error: error.message });
    console.error("QRegalo: error asignando clave:", error);
    return json(500, { error: "No fue posible consultar o asignar la clave del QR." });
  }
};
