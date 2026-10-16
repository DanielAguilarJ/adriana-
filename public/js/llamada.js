// Abre la llamada con el agente. Primero WebRTC (mejor audio y cancelación de eco);
// si falla, WebSocket. Cada intento tiene sus propios callbacks para que un intento
// fallido no "cuelgue" la interfaz mientras se prueba el respaldo.
import { Conversation } from '../vendor/elevenlabs-client.js';

export class ErrorLlamada extends Error {
  constructor(mensaje, { status = 0, tipo = 'conexion' } = {}) {
    super(mensaje);
    this.status = status;
    this.tipo = tipo;
  }
}

async function pedirJson(url) {
  let r;
  try {
    r = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ErrorLlamada('No pude conectar la llamada. Revisa tu internet e intenta de nuevo.');
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorLlamada(datos.error || 'No pude conectar la llamada. Intenta de nuevo en un momento.', { status: r.status });
  return datos;
}

/** Pide el micrófono antes de llamar para poder explicar bien si lo niegan. */
export async function pedirMicrofono() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new ErrorLlamada('Este navegador no permite usar el micrófono. Prueba con Chrome o Safari actualizados.', { tipo: 'microfono' });
  }
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    flujo.getTracks().forEach((t) => t.stop());
  } catch {
    throw new ErrorLlamada('Para hablar con mamá necesito tu micrófono. Dale permiso en el navegador y vuelve a intentar.', { tipo: 'microfono' });
  }
}

function callbacksDeIntento(callbacks, vigente) {
  return Object.fromEntries(
    Object.entries(callbacks).map(([nombre, fn]) => [nombre, (...args) => (vigente() ? fn(...args) : undefined)]),
  );
}

async function intentar(opciones, callbacks) {
  let vigente = true;
  try {
    const conversacion = await Conversation.startSession({ ...opciones, ...callbacksDeIntento(callbacks, () => vigente) });
    return conversacion;
  } catch (e) {
    vigente = false;
    throw e;
  }
}

/**
 * @param {{variables: Record<string,string>, callbacks: object}} opciones
 * @returns {Promise<object>} la conversación activa del SDK
 */
export async function conectar({ variables, callbacks }) {
  const base = { dynamicVariables: variables, useWakeLock: true };
  try {
    const { token } = await pedirJson('/api/token');
    return await intentar({ ...base, conversationToken: token, connectionType: 'webrtc' }, callbacks);
  } catch (e) {
    if (e instanceof ErrorLlamada && e.status === 429) throw e;
    console.warn('WebRTC no disponible, intento por WebSocket:', e?.message || e);
  }
  const { signedUrl } = await pedirJson('/api/signed-url');
  try {
    return await intentar({ ...base, signedUrl, connectionType: 'websocket' }, callbacks);
  } catch (e) {
    console.error('No se pudo iniciar la llamada:', e);
    throw new ErrorLlamada('No pude conectar la llamada. Revisa tu internet e intenta de nuevo.');
  }
}
