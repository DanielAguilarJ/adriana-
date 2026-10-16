// Convierte el análisis que ElevenLabs hace al colgar en una memoria mínima para
// el teléfono de Adriana. Nunca devuelve la transcripción completa.

const ID_CONVERSACION = /^conv_[A-Za-z0-9]{8,80}$/;
const EN_CURSO = new Set(['initiated', 'in-progress', 'processing']);
const SI = new Set(['true', 'sí', 'si', 'yes']);

const MAX = Object.freeze({ resumen: 600, pendientes: 300, datosNuevos: 800, animo: 40 });

export function esIdConversacion(id) {
  return typeof id === 'string' && ID_CONVERSACION.test(id);
}

function valorDe(resultados, id) {
  const v = resultados?.[id]?.value;
  return v === undefined ? null : v;
}

function texto(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

function aBooleano(v) {
  if (typeof v === 'boolean') return v;
  return SI.has(String(v ?? '').trim().toLowerCase());
}

/**
 * @param {object|null} conv  respuesta de GET /v1/convai/conversations/{id}
 * @param {string} agentId    solo se aceptan conversaciones de este agente
 */
export function extraerMemoria(conv, agentId) {
  if (!conv || conv.agent_id !== agentId) return { estado: 'ajena' };
  if (conv.status === 'failed') return { estado: 'fallida' };
  if (EN_CURSO.has(conv.status)) return { estado: 'procesando' };

  const analisis = conv.analysis || {};
  const resultados = analisis.data_collection_results || {};
  const inicio = conv.metadata?.start_time_unix_secs;
  return {
    estado: 'lista',
    resumen: texto(valorDe(resultados, 'resumen') ?? analisis.transcript_summary, MAX.resumen),
    pendientes: texto(valorDe(resultados, 'pendientes'), MAX.pendientes),
    datosNuevos: texto(valorDe(resultados, 'datos_nuevos'), MAX.datosNuevos),
    animo: texto(valorDe(resultados, 'animo'), MAX.animo),
    riesgo: aBooleano(valorDe(resultados, 'riesgo')),
    duracion: Number(conv.metadata?.call_duration_secs) || 0,
    inicio: Number.isFinite(inicio) ? new Date(inicio * 1000).toISOString() : null,
  };
}
