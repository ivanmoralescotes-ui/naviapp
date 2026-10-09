// Se ejecuta una vez por minuto mediante Netlify Scheduled Functions.
// No es una función HTTP pública.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  bd, identificador, enviarMeta, FieldValue, COLECCION, CONVERSACIONES,
  PENDIENTES, VENTANA_MS, MARGEN_MS, TEXTO_AUTO, fechaMs
} = require("../lib/qregalo-comun.js");

async function resolverPendiente(db, documento) {
  const ref = db.collection(PENDIENTES).doc(documento.id);
  const convRef = db.collection(CONVERSACIONES).doc(documento.id);
  const ahora = new Date();

  // Reclamar la tarea atómicamente; otro ejecutor o una intervención manual
  // no pueden reclamar el mismo pendiente.
  const tarea = await db.runTransaction(async (t) => {
    const [pendiente, conv] = await Promise.all([t.get(ref), t.get(convRef)]);
    if (!pendiente.exists) return null;
    const p = pendiente.data();
    const c = conv.exists ? conv.data() : {};
    if (p.estado !== "pendiente" || fechaMs(p.venceEn) > Date.now()) return null;
    const caducada = !Number.isFinite(fechaMs(c.ultimaEntradaFecha)) ||
      Date.now() - fechaMs(c.ultimaEntradaFecha) >= VENTANA_MS - MARGEN_MS;
    if (c.autoEnabled === false || c.version !== p.version || caducada) {
      t.delete(ref);
      t.set(convRef, { autoPendienteHasta: null }, { merge: true });
      return null;
    }
    // Mientras 'enviando', el panel impide un envío manual que duplique la respuesta.
    t.update(ref, { estado: "enviando", fechaInicio: ahora,
      venceEn: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    return { numero: documento.id, version: p.version, mensajeId: p.mensajeId };
  });

  if (!tarea) return;

  async function finalizar(error, idWhatsapp = null) {
    await db.runTransaction(async (t) => {
      const [pend, conv] = await Promise.all([t.get(ref), t.get(convRef)]);
      const activo = pend.exists && pend.data().estado === "enviando" &&
        pend.data().version === tarea.version;
      // El cliente pudo haber escrito otra vez mientras se llamaba a Meta:
      // nunca borrar la NUEVA tarea.
      if (activo) t.delete(ref);
      if (conv.exists && conv.data().version === tarea.version) {
        t.set(convRef, {
          autoPendienteHasta: null,
          errorAutomatico: error ? String(error).slice(0, 300) : null,
          ultimaRespuestaAuto: error ? (conv.data().ultimaRespuestaAuto || null) : new Date()
        }, { merge: true });
      }
      if (idWhatsapp) {
        t.set(db.collection(COLECCION).doc(identificador("out", idWhatsapp)), {
          numeroCliente: tarea.numero,
          direccion: "saliente", tipo: "text", texto: TEXTO_AUTO,
          idWhatsapp, origen: "respuesta_automatica_5min",
          fecha: new Date(), fechaGuardado: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });
  }

  try {
    const resultado = await enviarMeta(tarea.numero, TEXTO_AUTO);
    if (!resultado.ok || !resultado.idWhatsapp) {
      const msg = `Meta ${resultado.status} (código ${resultado.datos.error?.code || "sin código"})`;
      console.error("QRegalo automática:", msg);
      await finalizar(msg);
    } else {
      await finalizar(null, resultado.idWhatsapp);
      console.log("QRegalo: respuesta automática enviada y guardada", tarea.numero);
    }
  } catch (error) {
    // No reintentar envíos ambiguos automáticamente: se evitarían duplicados.
    console.error("QRegalo: envío automático requiere revisión", error);
    await finalizar("Error de red o de guardado; revisar logs antes de reenviar");
  }
}

export default async () => {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PHONE_NUMBER_ID) {
    console.error("QRegalo: falta configuración de Meta");
    return;
  }
  const db = bd();
  const vencidas = await db.collection(PENDIENTES)
    .where("venceEn", "<=", new Date())
    .orderBy("venceEn", "asc")
    .limit(10)
    .get();
  for (const doc of vencidas.docs) {
    try { await resolverPendiente(db, doc); }
    catch (error) { console.error("QRegalo: error procesando pendiente", doc.id, error); }
  }
};

// Netlify comprueba pendientes cada minuto; respuesta desde los 5 minutos,
// normalmente dentro del minuto siguiente. Solo se ejecuta en Production deploy.
export const config = { schedule: "* * * * *" };
