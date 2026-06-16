const { Storage } = require("@google-cloud/storage");

exports.handler = async function () {
  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const bucketName = process.env.GCS_BUCKET;

    if (!credentialsJson || !bucketName) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Faltan las variables de entorno del servidor."
        })
      };
    }

    const credentials = JSON.parse(credentialsJson);

    const storage = new Storage({
      projectId: credentials.project_id,
      credentials
    });

    const nombreArchivo = "ceo/Aos Velhos tempos.jpg";

    const archivo = storage
      .bucket(bucketName)
      .file(nombreArchivo);

    const [urlFirmada] = await archivo.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        url: urlFirmada
      })
    };
  } catch (error) {
    console.error("Error obteniendo el archivo:", error.message);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "No fue posible generar la URL del archivo."
      })
    };
  }
};
