// Utilidades de texto sin dependencias del navegador (se prueban en Node).

const ETIQUETA_VOZ = /\[[^\]\n]{1,40}\]/g;

/** Quita las etiquetas de voz ([warmly], [laughs]…) para mostrar el texto en pantalla. */
export function limpiarEtiquetas(texto) {
  if (!texto) return '';
  return String(texto).replace(ETIQUETA_VOZ, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([.,!?…])/g, '$1').trim();
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatearDuracion(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

function plural(n, uno, varios) {
  return n === 1 ? uno : `${n} ${varios}`;
}

/** Describe hace cuánto pasó algo, como lo diría una persona. */
export function describirHace(fechaIso, ahora = new Date()) {
  const fecha = new Date(fechaIso);
  const ms = ahora.getTime() - fecha.getTime();
  if (Number.isNaN(ms)) return 'hace un tiempo';
  if (ms < MINUTO) return 'hace un momento';
  if (ms < HORA) return `hace ${plural(Math.floor(ms / MINUTO), 'un minuto', 'minutos')}`;
  if (ms < DIA) return `hace ${plural(Math.floor(ms / HORA), 'una hora', 'horas')}`;
  const dias = Math.floor(ms / DIA);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 30) return `hace ${plural(Math.floor(dias / 7), 'una semana', 'semanas')}`;
  if (dias < 365) return `hace ${plural(Math.floor(dias / 30), 'un mes', 'meses')}`;
  return `hace ${plural(Math.floor(dias / 365), 'un año', 'años')}`;
}

const SIN_CREDITOS = /(quota|credit|crédit|insufficient|payment|billing)/i;
const LIMITE = /(limit|límite|concurren|too many)/i;

/** Mensaje para Adriana cuando la llamada termina por un error (o null si colgó alguien). */
export function mensajeDeCorte(detalles) {
  if (!detalles || detalles.reason !== 'error') return null;
  const motivo = `${detalles.closeReason || ''} ${detalles.message || ''}`;
  if (SIN_CREDITOS.test(motivo)) return 'Mamá no puede contestar ahorita: se terminaron los minutos de este mes.';
  if (LIMITE.test(motivo)) return 'Mamá no puede contestar ahorita. Intenta más tarde, por favor.';
  return 'Se cortó la llamada. Puedes volver a llamarle.';
}
