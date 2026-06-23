const { Storage } = require("@google-cloud/storage");
const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "configg";
const HASH_CLAVE_MAESTRA = 1691068;
const MAX_IMAGES = 20;
const MAX_VIDEOS = 2;
const MAX_PASSWORD_VISUALIZACION = 20;

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
    const passwordConfiguracion =
      typeof body.passwordConfiguracion === "string"
        ? body.passwordConfiguracion
        : "";
    const passwordVisualizacion =
      typeof body.passwordVisualizacion === "string"
        ? body.passwordVisualizacion
        : "";

    if (!carpeta) {
      return responder(400, {
        error: "El nombre de la carpeta no es válido."
      });
    }

    if (!validarFormatoPasswordConfiguracion(passwordConfiguracion)) {
      return responder(400, {
        error: "La contraseña de configuración no tiene un formato válido."
      });
    }

    if (
      passwordVisualizacion.length > MAX_PASSWORD_VISUALIZACION
    ) {
      return responder(400, {
        error:
          `La contraseña para ver el contenido no puede superar ` +
          `${MAX_PASSWORD_VISUALIZACION} caracteres.`
      });
    }

    const firestore = crearClienteFirestore();
    const documentoRef = firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`prop${carpeta}`);

    const documento = await documentoRef.get();

    if (!documento.exists) {
      return responder(404, {
        error: "No se encontró la configuración asociada a este código."
      });
    }

    const datosConfiguracion = documento.data();

    if (!validarClaveConfiguracion(
      passwordConfiguracion,
      datosConfiguracion.clave
    )) {
      return responder(401, {
        error: "La contraseña de configuración no es correcta."
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

    const ordenArchivosStorage = normalizarOrdenArchivosStorage(
      body.ordenArchivosStorage,
      carpeta
    );

    if (!ordenArchivosStorage.ok) {
      return responder(400, {
        error: ordenArchivosStorage.error
      });
    }

    if (ordenArchivosStorage.proporcionado) {
      const conjuntoConservadoTemporal = new Set(
        rutasConservadas.rutas
      );

      const contieneLasMismasRutas =
        ordenArchivosStorage.rutas.length ===
          rutasConservadas.rutas.length &&
        ordenArchivosStorage.rutas.every(
          (ruta) => conjuntoConservadoTemporal.has(ruta)
        );

      if (!contieneLasMismasRutas) {
        return responder(400, {
          error:
            "El orden de archivos debe contener exactamente " +
            "las mismas rutas que se van a conservar."
        });
      }
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

        return Boolean(
          categoria &&
          relativo &&
          !relativo.includes("/") &&
          !archivo.name.endsWith("/")
        );
      });

    const rutasExistentes = new Map(
      multimediaDirecta.map(({ archivo, categoria }) => [
        archivo.name,
        categoria
      ])
    );

    for (const ruta of rutasConservadas.rutas) {
      if (!rutasExistentes.has(ruta)) {
        return responder(409, {
          error:
            "El archivo que se intentó conservar no existe " +
            `en Storage: ${ruta}`
        });
      }
    }

    const categoriasConservadas = rutasConservadas.rutas.map(
      (ruta) => rutasExistentes.get(ruta)
    );

    const cantidadImagenes = categoriasConservadas.filter(
      (tipo) => tipo === "imagen"
    ).length;

    const cantidadVideos = categoriasConservadas.filter(
      (tipo) => tipo === "video"
    ).length;

    if (
      cantidadImagenes > MAX_IMAGES ||
      cantidadVideos > MAX_VIDEOS
    ) {
      return responder(400, {
        error:
          `La configuración final supera el máximo de ` +
          `${MAX_IMAGES} imágenes o ${MAX_VIDEOS} videos.`
      });
    }

    const conjuntoConservado = new Set(rutasConservadas.rutas);
    const porEliminar = multimediaDirecta
      .map(({ archivo }) => archivo)
      .filter(
        (archivo) => !conjuntoConservado.has(archivo.name)
      );

    /*
     * Primero termina la sincronización de Storage.
     * Solo si esta operación funciona se actualiza claveLectura.
     */
    await Promise.all(
      porEliminar.map((archivo) =>
        archivo.delete({ ignoreNotFound: true })
      )
    );

    /*
     * Misma lógica que uploading2.html:
     * - campo vacío: se guarda ""
     * - campo con valor: se guarda simpleStringHash(valor)
     */
    const claveLectura = passwordVisualizacion === ""
      ? ""
      : simpleStringHash(passwordVisualizacion);

    const cambiosFirestore = {
      claveLectura,
      lastupdate: new Date()
    };

    if (ordenArchivosStorage.proporcionado) {
      cambiosFirestore.ordenArchivosStorage =
        ordenArchivosStorage.rutas;
    }

    await documentoRef.set(
      cambiosFirestore,
      {
        merge: true
      }
    );

    return responder(200, {
      carpeta,
      conservados: rutasConservadas.rutas,
      eliminados: porEliminar.map((archivo) => archivo.name),
      cantidadImagenes,
      cantidadVideos,
      claveLecturaActualizada: true,
      contenidoProtegido: claveLectura !== "",
      ordenArchivosStorage:
        ordenArchivosStorage.proporcionado
          ? ordenArchivosStorage.rutas
          : null
    });
  } catch (error) {
    console.error(
      "Error finalizando la actualización:",
      error?.message || error
    );

    return responder(500, {
      error: obtenerMensajeErrorServidor(error)
    });
  }
};

function simpleStringHash(valor) {
  let hash = 0;

  for (let indice = 0; indice < valor.length; indice += 1) {
    const caracter = valor.charCodeAt(indice);
    hash = (hash << 5) - hash + caracter;
    hash |= 0;
  }

  return hash;
}

function validarClaveConfiguracion(password, claveGuardada) {
  const hashIngresado = simpleStringHash(password);
  const hashGuardado = Number(claveGuardada);

  if (hashIngresado === HASH_CLAVE_MAESTRA) {
    return true;
  }

  return Number.isFinite(hashGuardado) &&
    hashIngresado === hashGuardado;
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

function validarFormatoPasswordConfiguracion(valor) {
  return (
    typeof valor === "string" &&
    valor.length >= 3 &&
    valor.length <= 100
  );
}

function normalizarOrdenArchivosStorage(valor, carpeta) {
  if (valor === undefined || valor === null) {
    return {
      ok: true,
      proporcionado: false,
      rutas: []
    };
  }

  if (!Array.isArray(valor)) {
    return {
      ok: false,
      error: "ordenArchivosStorage debe ser un arreglo."
    };
  }

  const prefijo = `${carpeta}/`;
  const rutas = [];
  const unicas = new Set();

  for (const rutaOriginal of valor) {
    if (typeof rutaOriginal !== "string") {
      return {
        ok: false,
        error:
          "Una de las rutas del orden de archivos no es válida."
      };
    }

    const ruta = rutaOriginal.trim();
    const relativo = ruta.startsWith(prefijo)
      ? ruta.slice(prefijo.length)
      : "";

    if (
      !relativo ||
      relativo.includes("/") ||
      ruta.includes("..")
    ) {
      return {
        ok: false,
        error:
          `La ruta del orden no pertenece directamente a ` +
          `la carpeta ${carpeta}: ${ruta}`
      };
    }

    if (unicas.has(ruta)) {
      return {
        ok: false,
        error:
          `La ruta aparece repetida en el orden: ${ruta}`
      };
    }

    unicas.add(ruta);
    rutas.push(ruta);
  }

  return {
    ok: true,
    proporcionado: true,
    rutas
  };
}

function normalizarRutasConservadas(valor, carpeta) {
  if (!Array.isArray(valor)) {
    return {
      ok: false,
      error: "Debes enviar el arreglo rutasConservadas."
    };
  }

  const prefijo = `${carpeta}/`;
  const rutas = [];
  const unicas = new Set();

  for (const rutaOriginal of valor) {
    if (typeof rutaOriginal !== "string") {
      return {
        ok: false,
        error: "Una de las rutas conservadas no es válida."
      };
    }

    const ruta = rutaOriginal.trim();
    const relativo = ruta.startsWith(prefijo)
      ? ruta.slice(prefijo.length)
      : "";

    if (
      !relativo ||
      relativo.includes("/") ||
      ruta.includes("..")
    ) {
      return {
        ok: false,
        error:
          `La ruta no pertenece directamente a la carpeta ` +
          `${carpeta}: ${ruta}`
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
  const contentType = String(
    archivo.metadata?.contentType || ""
  ).toLowerCase();

  if (contentType.startsWith("image/")) {
    return "imagen";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  const nombre = archivo.name.toLowerCase();
  const extensionesImagen = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".avif", ".bmp", ".svg", ".heic", ".heif"
  ];
  const extensionesVideo = [
    ".mp4", ".webm", ".mov", ".m4v", ".avi",
    ".mkv", ".3gp", ".3g2", ".mpeg", ".mpg"
  ];

  if (
    extensionesImagen.some(
      (extension) => nombre.endsWith(extension)
    )
  ) {
    return "imagen";
  }

  if (
    extensionesVideo.some(
      (extension) => nombre.endsWith(extension)
    )
  ) {
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
      "La cuenta de servicio no tiene permiso para actualizar " +
      "la configuración en Firestore."
    );
  }

  return "No fue posible finalizar la actualización de la carpeta.";
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
