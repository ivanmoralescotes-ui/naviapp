"use strict";

// Entrega imágenes recibidas por WhatsApp ÚNICAMENTE al administrador autenticado.
// No devuelve el token de Meta ni las URL temporales de descarga al navegador.
const { bd, json, verificarAdmin, COLECCION } = require("../lib/qregalo-comun");

// Las funciones Netlify sin streaming tienen un límite de respuesta. Una imagen
// de 3,5 MiB ocupa ~4,7 MiB en base64 y deja margen bajo el límite de 6 MiB.
const MAX_BYTES = 3_500_000;
const TIMEOUT_MS = 15_000;
const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function cdnMetaPermitido(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return ["fbsbx.com", "fbcdn.net", "whatsapp.net", "facebook.com"].some(
      (dominio) => host === dominio || host.endsWith("." + dominio)
    );
  } catch (_) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Método no permitido" });

  const admin = await verificarAdmin(event);
  if (admin.error) return json(admin.status, { error: admin.error });

  const mensajeId = String(event.queryStringParameters?.mensajeId || "");
  // Son IDs internos tipo in_<sha256>, nunca IDs proporcionados por Meta.
  if (!/^in_[a-f0-9]{64}$/.test(mensajeId)) {
    return json(400, { error: "Identificador de imagen inválido." });
  }

  try {
    // Comprobar que pertenece a un mensaje de IMAGEN entrante guardado en QRegalo.
    const mensaje = await bd().collection(COLECCION).doc(mensajeId).get();
    if (!mensaje.exists) return json(404, { error: "No se encontró esta imagen." });
    const datos = mensaje.data() || {};
    const mediaId = String(datos.mediaId || "");
    if (datos.direccion !== "entrante" || datos.tipo !== "image" || !/^\d{5,40}$/.test(mediaId)) {
      return json(404, { error: "Este mensaje no contiene una imagen recuperable." });
    }

    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return json(503, { error: "Falta configurar META_ACCESS_TOKEN en Netlify." });
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    // Paso 1: URL temporal autorizada de Meta para el ID recibido.
    const metadataRespuesta = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(mediaId)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal }
    );
    if (!metadataRespuesta.ok) {
      console.warn("QRegalo imagen: Meta no pudo consultar el archivo", metadataRespuesta.status);
      return json(404, { error: "Meta ya no permite recuperar esta imagen. Puede haber caducado." });
    }
    const metadata = await metadataRespuesta.json();
    const tipoMeta = String(metadata.mime_type || "").split(";")[0].toLowerCase();
    const tamanoMeta = Number(metadata.file_size || 0);
    if (!TIPOS_PERMITIDOS.has(tipoMeta)) {
      return json(415, { error: "El formato de esta imagen no es compatible." });
    }
    if (tamanoMeta > MAX_BYTES) {
      return json(413, { error: "Esta imagen supera el límite de vista previa (3,5 MB)." });
    }
    if (!cdnMetaPermitido(metadata.url)) {
      console.warn("QRegalo imagen: URL de descarga no reconocida");
      return json(502, { error: "La dirección de descarga de Meta no es válida." });
    }

    // Paso 2: descargar la imagen desde el servidor, sin divulgar el token.
    const mediaRespuesta = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${token}` }, signal
    });
    if (!mediaRespuesta.ok) {
      console.warn("QRegalo imagen: Meta no pudo descargar el archivo", mediaRespuesta.status);
      return json(502, { error: "No fue posible descargar esta imagen desde Meta." });
    }
    const tamañoCabecera = Number(mediaRespuesta.headers.get("content-length") || 0);
    if (tamañoCabecera > MAX_BYTES) {
      return json(413, { error: "Esta imagen supera el límite de vista previa (3,5 MB)." });
    }
    const tipoRespuesta = String(mediaRespuesta.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (tipoRespuesta && tipoRespuesta !== "application/octet-stream" && !TIPOS_PERMITIDOS.has(tipoRespuesta)) {
      return json(502, { error: "Meta no devolvió un archivo de imagen válido." });
    }
    const buffer = Buffer.from(await mediaRespuesta.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return json(413, { error: "La imagen está vacía o supera los 3,5 MB." });
    }

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": tipoMeta,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      },
      body: buffer.toString("base64")
    };
  } catch (error) {
    console.error("QRegalo imagen: error obteniendo media", error?.message || String(error));
    return json(502, { error: "No se pudo recuperar la imagen de WhatsApp. Prueba de nuevo." });
  }
};
