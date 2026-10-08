exports.handler = async (event) => {

// 1. Verificación del webhook de Meta
if (event.httpMethod === "GET") {
const params = event.queryStringParameters || {};

if (
params["hub.mode"] === "subscribe" &&
params["hub.verify_token"] === process.env.META_VERIFY_TOKEN
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

// 2. Recibir mensajes de WhatsApp
if (event.httpMethod === "POST") {

try {
const data = JSON.parse(event.body || "{}");

for (const entry of data.entry || []) {
for (const change of entry.changes || []) {
const mensajes = change.value?.messages || [];

for (const mensaje of mensajes) {

// Responder solamente mensajes de texto
if (mensaje.type !== "text") continue;

console.log("Mensaje recibido");

const respuesta = await fetch(
`https://graph.facebook.com/v24.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
{
method: "POST",
headers: {
"Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}`,
"Content-Type": "application/json"
},
body: JSON.stringify({
messaging_product: "whatsapp",
to: mensaje.from,
type: "text",
text: {
body: "Hola, recibí tu mensaje 😊"
}
})
}
);

if (respuesta.ok) {
console.log("Respuesta enviada correctamente");
} else {
console.error(
"Error enviando respuesta:",
respuesta.status,
await respuesta.text()
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
