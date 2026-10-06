const crypto = require("crypto");
const { Firestore } = require("@google-cloud/firestore");

const FIRESTORE_PROJECT_ID = "qrpro-f4709";
const FIRESTORE_COLLECTION = "codigos";
const ESTADOS_PERMITIDOS = new Set(["disponible","reservado","dado","pendiente"]);

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(405,{error:"Método no permitido."},{Allow:"POST"});
  }

  try {
    const body = leerJson(event);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) return responder(400,{error:"Falta la contraseña."});
    if (!validarPassword(password)) return responder(401,{error:"La contraseña no es correcta."});

    const id = normalizarId(body.id);
    const estado = normalizarEstado(body.estado);
    if (!id) return responder(400,{error:"El código recibido no es válido."});
    if (!estado) return responder(400,{error:"El estado seleccionado no es válido."});

    const firestore = crearClienteFirestore();
    const documentoRef = firestore.collection(FIRESTORE_COLLECTION).doc(id);

    await firestore.runTransaction(async transaccion => {
      const documento = await transaccion.get(documentoRef);
      if (!documento.exists) {
        const e = new Error("El código solicitado no existe.");
        e.statusCode = 404;
        throw e;
      }
      transaccion.update(documentoRef,{estado});
    });

    return responder(200,{ok:true,id,estado});
  } catch (error) {
    console.error("Error cambiando estado del código:",error?.message||error);
    if (Number.isInteger(error?.statusCode)) return responder(error.statusCode,{error:error.message});
    return responder(500,{error:"No fue posible cambiar el estado."});
  }
};

function validarPassword(passwordIngresado) {
  const passwordConfigurado = process.env.LIST_UPDATED_PASSWORD;
  if (!passwordConfigurado) throw new Error("Falta la variable de entorno LIST_UPDATED_PASSWORD.");
  const a = crypto.createHash("sha256").update(passwordIngresado,"utf8").digest();
  const b = crypto.createHash("sha256").update(passwordConfigurado,"utf8").digest();
  return crypto.timingSafeEqual(a,b);
}

function normalizarId(valor){
  if(typeof valor!=="string")return"";
  const id=valor.trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id)?id:"";
}

function normalizarEstado(valor){
  if(typeof valor!=="string")return"";
  const estado=valor.trim().toLowerCase();
  return ESTADOS_PERMITIDOS.has(estado)?estado:"";
}

function crearClienteFirestore(){
  return new Firestore({projectId:FIRESTORE_PROJECT_ID,credentials:obtenerCredencialesGoogle()});
}

function obtenerCredencialesGoogle(){
  const credentialsJson=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!credentialsJson)throw new Error("Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON.");
  let credentials;
  try{credentials=JSON.parse(credentialsJson)}catch{throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido.")}
  if(!credentials.project_id||!credentials.client_email||!credentials.private_key)throw new Error("Las credenciales de Google no contienen los campos requeridos.");
  return credentials;
}

function leerJson(event){
  if(!event.body)return{};
  const contenido=event.isBase64Encoded?Buffer.from(event.body,"base64").toString("utf8"):event.body;
  try{return JSON.parse(contenido)}catch{const e=new Error("JSON inválido.");e.statusCode=400;throw e}
}

function responder(statusCode,body,extraHeaders={}){
  return {statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extraHeaders},body:JSON.stringify(body)};
}
