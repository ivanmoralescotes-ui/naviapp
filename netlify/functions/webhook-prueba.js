
const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

// Inicializar Firebase cuando sea necesario
function obtenerFirestore() {

  if (getApps().length === 0) {

    const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!json) {
      throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON en Netlify");
    }

    const credenciales = JSON.parse(json);

    if (credenciales.private_key) {
      credenciales.private_key =
        credenciales.private_key.replace(/\\n/g, "\n");
    }

    initializeApp({
      credential: cert(credenciales)
    });
  }

  return getFirestore();
}

// Generar identificador único para cada mensaje
function identificador(prefijo, idWhatsapp) {
  const hash = crypto
    .createHash("sha256")
    .update(idWhatsapp)
    .digest("hex");

  return `${prefijo}_${hash}`;
}

// Guardar mensajes sin duplicarlos
async function guardarMensaje(id, datos) {
  try {
    const db = obtenerFirestore();

    await db.collection("whatsapp_mensajes")
      .doc(id)
      .create({
        ...datos,
        
		fechaGuardado: FieldValue.serverTimestamp()
      });

    console.log("Mensaje guardado en Firestore:", id);
    return "nuevo";

  } catch (error) {
    if (error.code === 6 || error.code === "already-exists") {
      console.log("Mensaje duplicado, ignorado:", id);
      return "duplicado";
    }

    console.error("Error guardando en Firestore:", error);
    return "error";
  }
}

exports.handler = async (event) => {

  // 1. Verificación del webhook de Meta
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    if (
      params["hub.mode"] === "subscribe" &&
      process.env.META_VERIFY_TOKEN &&
      params["hub.verify_token"] === process.env.META_VERIFY_TOKEN &&
      params["hub.challenge"] != null
    ) {
      return {
        statusCode: 200,
        body: params["hub.challenge"]
      };
    }

    return {
      statusCode: 403,
      body: "Verificación fallida"
    };
  }

  // 2. Recibir notificaciones de WhatsApp
  if (event.httpMethod === "POST") {
    try {
      const data = JSON.parse(event.body || "{}");

      for (const entry of data.entry || []) {
        for (const change of entry.changes || []) {

          // Solo procesar eventos del número configurado
          const phoneId = change.value?.metadata?.phone_number_id;

          if (
            phoneId &&
            phoneId !== process.env.META_PHONE_NUMBER_ID
          ) {
            continue;
          }

          const mensajes = change.value?.messages || [];

          for (const mensaje of mensajes) {
            if (!mensaje.id || !mensaje.from) continue;

            const numero = mensaje.from;
            const tipo = mensaje.type;

            const texto = tipo === "text"
              ? (mensaje.text?.body || "")
              : (mensaje[tipo]?.caption || "");

            const idEntrada = identificador("in", mensaje.id);

            // 3. Guardar el mensaje entrante
            const estado = await guardarMensaje(idEntrada, {
              numeroCliente: numero,
              direccion: "entrante",
              tipo: tipo,
              texto: texto,
              idWhatsapp: mensaje.id,
              mediaId: mensaje[tipo]?.id || null,
              mimeType: mensaje[tipo]?.mime_type || null,
              nombreArchivo: mensaje.document?.filename || null,
              fecha: mensaje.timestamp
                ? new Date(Number(mensaje.timestamp) * 1000)
                : new Date()
            });

            // No contestar nuevamente mensajes duplicados
            if (estado === "duplicado") continue;

            console.log("Mensaje recibido:", tipo);

            // Mantener la respuesta automática solo para texto
            if (tipo !== "text") continue;

            const textoRespuesta = "Hola, recibí tu mensaje 😊";

            // 4. Enviar respuesta automática
            const respuesta = await fetch(
              `https://graph.facebook.com/v24.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: numero,
                  type: "text",
                  text: {
                    body: textoRespuesta
                  }
                })
              }
            );

            const resultado = await respuesta.json();

            if (respuesta.ok) {
              console.log("Respuesta enviada correctamente");

              // 5. Guardar también la respuesta enviada
              const idSalidaWhatsApp = resultado.messages?.[0]?.id;

              const idSalida = identificador(
                "out",
                idSalidaWhatsApp || mensaje.id
              );

              await guardarMensaje(idSalida, {
                numeroCliente: numero,
                direccion: "saliente",
                tipo: "text",
                texto: textoRespuesta,
                idWhatsapp: idSalidaWhatsApp || null,
                fecha: new Date()
              });

            } else {
              console.error(
                "Error enviando respuesta:",
                respuesta.status,
                resultado
              );
            }
          }
        }
      }

    } catch (error) {
      console.error("Error procesando webhook:", error);
    }

    return {
      statusCode: 200,
      body: "OK"
    };
  }

  return {
    statusCode: 405,
    body: "Método no permitido"
  };
};
