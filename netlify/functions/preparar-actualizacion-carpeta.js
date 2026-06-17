const crypto = require("crypto");
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const { Firestore } = require("@google-cloud/firestore");

const HASH_CLAVE_MAESTRA = 1691068;
const MAX_IMAGES = 7;
const MAX_VIDEOS = 2;
const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";

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

    if (!carpeta) {
      return responder(400, {
        error: "El nombre de la carpeta no es válido."
      });
    }

    const passwordConfiguracion =
      typeof body.passwordConfiguracion === "string"
        ? body.passwordConfiguracion
        : "";

    if (
      passwordConfiguracion.length < 3 ||
      passwordConfiguracion.length > 100
    ) {
      return responder(400, {
        error: "La contraseña de configuración no tiene un formato válido."
      });
    }

    /*
     * uploading2.html consulta un documento llamado "prop" + identificador.
     * En config1, la carpeta decodificada es ese identificador:
     * carpeta "fly" -> documento "propfly".
     */
    const datosConfiguracion = await obtenerDatosConfiguracion(carpeta);

    if (!datosConfiguracion) {
      return responder(404, {
        error: "No se encontró la configuración asociada a este código."
      });
    }

    const claveCorrecta = validarClaveConfiguracion(
      passwordConfiguracion,
      datosConfiguracion.clave
    );

    if (!claveCorrecta) {
      return responder(401, {
        error: "La contraseña de configuración no es correcta."
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
        const identificador = crypto.randomUUID()
          .replace(/-/g, "")
          .slice(0, 10);

        const nombreGuardado =
          `${ahora + indice}-${identificador}-${nombreSeguro}`;

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
    console.error(
      "Error preparando la actualización:",
      error?.message || error
    );

    return responder(500, {
      error: obtenerMensajeErrorServidor(error)
    });
  }
};

/*
 * Reproduce la función simpleStringHash utilizada en uploading2.html.
 */
function simpleStringHash(valor) {
  let hash = 0;

  for (let indice = 0; indice < valor.length; indice += 1) {
    const caracter = valor.charCodeAt(indice);
    hash = (hash << 5) - hash + caracter;
    hash |= 0;
  }

  return hash;
}

/*
 * La clave es válida cuando su hash coincide con:
 * 1. La clave maestra utilizada por uploading2.html, o
 * 2. El campo "clave" del documento correspondiente en Firestore.
 */
function validarClaveConfiguracion(password, claveGuardada) {
  const hashIngresado = simpleStringHash(password);
  const hashGuardado = Number(claveGuardada);

  if (hashIngresado === HASH_CLAVE_MAESTRA) {
    return true;
  }

  return Number.isFinite(hashGuardado) && hashIngresado === hashGuardado;
}

/*
 * Busca el documento "prop{carpeta}".
 *
 * Opción recomendada:
 * definir FIRESTORE_COLLECTION con el nombre de la colección.
 *
 * Si FIRESTORE_COLLECTION no existe, se revisan las colecciones
 * principales hasta encontrar el documento. Esto permite que la función
 * opere aunque el nombre de la colección todavía no esté configurado.
 */
async function obtenerDatosConfiguracion(carpeta) {
  const firestore = crearClienteFirestore();
  const documentId = `prop${carpeta}`;
  const collectionName = FIRESTORE_COLLECTION;
  //normalizarNombreColeccion(
    //process.env.FIRESTORE_COLLECTION
  //);

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
    projectId: FIRESTORE_PROJECT_ID,
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

function validarArchivosNuevos(archivos) {
  if (archivos.length > MAX_IMAGES + MAX_VIDEOS) {
    return {
      ok: false,
      error:
        `No puedes subir más de ${MAX_IMAGES} imágenes ` +
        `y ${MAX_VIDEOS} videos.`
    };
  }

  let imagenes = 0;
  let videos = 0;

  for (const item of archivos) {
    if (
      !item ||
      typeof item.nombre !== "string" ||
      !item.nombre.trim()
    ) {
      return {
        ok: false,
        error: "Uno de los archivos no tiene un nombre válido."
      };
    }

    if (typeof item.tipo !== "string") {
      return {
        ok: false,
        error: `El archivo ${item.nombre} no tiene un tipo válido.`
      };
    }

    const categoria = obtenerCategoriaMime(item.tipo);

    if (!categoria) {
      return {
        ok: false,
        error:
          `El archivo ${item.nombre} no es una imagen ` +
          "ni un video permitido."
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
    return {
      ok: false,
      error:
        `Solo puedes subir un máximo de ${MAX_IMAGES} imágenes nuevas.`
    };
  }

  if (videos > MAX_VIDEOS) {
    return {
      ok: false,
      error:
        `Solo puedes subir un máximo de ${MAX_VIDEOS} videos nuevos.`
    };
  }

  return { ok: true };
}

function crearNombreSeguro(nombreOriginal) {
  const extensionOriginal = path.extname(nombreOriginal).toLowerCase();
  const baseOriginal = path.basename(
    nombreOriginal,
    extensionOriginal
  );

  const baseSegura = baseOriginal
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "archivo";

  const extensionSegura =
    /^\.[a-zA-Z0-9]{1,10}$/.test(extensionOriginal)
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

function normalizarNombreColeccion(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const nombre = valor.trim();

  /*
   * Se acepta una ruta de colección sencilla o anidada,
   * pero se bloquean segmentos vacíos y caracteres de control.
   */
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

  return "No fue posible preparar la subida de los archivos.";
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
