exports.handler = async (event) => {

  // 1. Verificación del webhook por Meta
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];

    if (
      mode === "subscribe" &&
      process.env.META_VERIFY_TOKEN &&
      token === process.env.META_VERIFY_TOKEN &&
      challenge
    ) {
      return {
        statusCode: 200,
        body: challenge
      };
    }

    return {
      statusCode: 403,
      body: "Verificación fallida"
    };
  }

  // 2. Recibir notificaciones de WhatsApp
  if (event.httpMethod === "POST") {
    console.log("Webhook recibido");
    console.log("Contenido recibido:", event.body);
    return {
      statusCode: 200,
      body: "hola"
    };
  }

  return {
    statusCode: 405,
    body: "Método no permitido"
  };
};
