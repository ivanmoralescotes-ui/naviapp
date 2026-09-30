const N8N_WEBHOOK_BASE_URL =
  process.env.N8N_AI_WEBHOOK_BASE_URL ||
  "https://ivanmorales.app.n8n.cloud/webhook/5b747ca1-9205-4d49-8440-789694d367b7/readquote11";

const N8N_BASIC_USER = process.env.N8N_BASIC_USER;
const N8N_BASIC_PASSWORD = process.env.N8N_BASIC_PASSWORD;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(
      405,
      { error: "Método no permitido. Usa POST." },
      { Allow: "POST" }
    );
  }

  try {
    if (!N8N_BASIC_USER || !N8N_BASIC_PASSWORD) {
      throw new Error(
        "Faltan N8N_BASIC_USER o N8N_BASIC_PASSWORD en las variables de entorno."
      );
    }

    const body = leerJson(event);
    const tipo = normalizarTipo(body.tipo);

    if (!tipo) {
      return responder(400, {
        error: "El tipo solicitado no es válido."
      });
    }

    const baseUrl = String(N8N_WEBHOOK_BASE_URL || "").replace(/\/+$/, "");

    if (!baseUrl.startsWith("https://")) {
      throw new Error("N8N_AI_WEBHOOK_BASE_URL no es una URL HTTPS válida.");
    }

    const url = `${baseUrl}/${encodeURIComponent(tipo)}`;

    const credenciales = Buffer
      .from(`${N8N_BASIC_USER}:${N8N_BASIC_PASSWORD}`, "utf8")
      .toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let respuestaN8n;

    try {
      respuestaN8n = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credenciales}`,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!respuestaN8n.ok) {
      console.error(
        "n8n respondió con estado:",
        respuestaN8n.status
      );

      return responder(502, {
        error: "No fue posible obtener la respuesta de IA."
      });
    }

    let datos;

    try {
      datos = await respuestaN8n.json();
    } catch {
      return responder(502, {
        error: "n8n devolvió una respuesta no válida."
      });
    }

    return responder(200, {
      output: datos?.output == null ? "" : String(datos.output)
    });
  } catch (error) {
    console.error(
      "Error consultando n8n:",
      error?.name || "",
      error?.message || error
    );

    if (error?.name === "AbortError") {
      return responder(504, {
        error: "La consulta de IA tardó demasiado."
      });
    }

    if (Number.isInteger(error?.statusCode)) {
      return responder(error.statusCode, {
        error: error.message
      });
    }

    return responder(500, {
      error: "No fue posible consultar el servicio de IA."
    });
  }
};

function normalizarTipo(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  const tipo = valor.trim();

  return /^[a-zA-Z0-9_-]{1,60}$/.test(tipo)
    ? tipo
    : "";
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
