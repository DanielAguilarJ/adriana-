// Cómo contesta mamá el teléfono. El texto pasa a la voz tal cual, así que las
// etiquetas entre corchetes (en inglés) solo dirigen la emoción de la voz.

export const SALUDOS = Object.freeze({
  madrugada: [
    '[softly] ¿Bueno? ¿{apodo}? ¿Qué haces despierta a estas horas? ¿Todo bien?',
    '[softly] ¿Bueno? Ay, {apodo}, ¿sigues despierta? Cuéntame, ¿qué pasó?',
    '[tenderly] ¿Bueno? ¿{apodo}? ¿Tan desvelada? Aquí estoy, cuéntame.',
  ],
  mañana: [
    '[warmly] ¿Bueno? ¡Buenos días, {apodo}! ¿Cómo amaneciste?',
    '[warmly] ¡Buenos días, {apodo}! Qué bonito que me hablas tan temprano. ¿Cómo amaneciste?',
    '[warmly] ¿Bueno? ¡{apodo}! Buenos días. ¿Ya desayunaste?',
    '[warmly] ¡Hola, {apodo}! Buenos días. ¿Cómo dormiste?',
  ],
  tarde: [
    '[warmly] ¿Bueno? ¡Hola, {apodo}! ¿Cómo va tu día?',
    '[warmly] ¡{apodo}! Qué gusto que me hablas. ¿Cómo estás?',
    '[warmly] ¿Bueno? ¡Hola, {apodo}! ¿Ya comiste?',
    '[warmly] ¡Hola, {apodo}! Justo estaba pensando en ti. ¿Cómo te va?',
  ],
  noche: [
    '[warmly] ¿Bueno? ¡Hola, {apodo}! ¿Cómo te fue hoy?',
    '[warmly] ¡{apodo}! Qué gusto escucharte. ¿Cómo estuvo tu día?',
    '[warmly] ¿Bueno? ¡Hola, {apodo}! ¿Ya cenaste?',
    '[warmly] ¡Hola, {apodo}! ¿Cómo estás? Cuéntame de tu día.',
  ],
  otraVez: [
    '[laughs softly] ¿Bueno? ¡Otra vez mi {apodo}! ¿Qué pasó?',
    '[warmly] ¡{apodo}, regresaste! Aquí sigo, cuéntame.',
    '[warmly] ¿Bueno? ¡Hola de nuevo, {apodo}! ¿Se te olvidó contarme algo?',
  ],
});

const APODO_POR_DEFECTO = 'mi amor';
const MINUTOS_OTRA_VEZ = 180;

export function franjaDelDia(hora) {
  if (hora < 5) return 'madrugada';
  if (hora < 12) return 'mañana';
  if (hora < 19) return 'tarde';
  return 'noche';
}

/** Primer apodo de la lista, sin caracteres que confundan a la voz o a la plantilla. */
function limpiarApodo(apodo) {
  const limpio = String(apodo ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[{}[\]<>]/g, ' ')
    .split(/[,;\n]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  return limpio || APODO_POR_DEFECTO;
}

function esReciente(fechaIso, fecha) {
  if (!fechaIso) return false;
  const ms = fecha.getTime() - new Date(fechaIso).getTime();
  return ms >= 0 && ms < MINUTOS_OTRA_VEZ * 60_000;
}

/**
 * Elige cómo contesta mamá.
 * @param {{fecha?: Date, apodo?: string, ultimaPlatica?: string, azar?: () => number}} opciones
 */
export function elegirSaludo({ fecha = new Date(), apodo, ultimaPlatica, azar = Math.random } = {}) {
  const grupo = esReciente(ultimaPlatica, fecha) ? 'otraVez' : franjaDelDia(fecha.getHours());
  const opciones = SALUDOS[grupo];
  const indice = Math.min(opciones.length - 1, Math.floor(azar() * opciones.length));
  const nombre = limpiarApodo(apodo);
  // "mi {apodo}" con un apodo que ya empieza por "mi" sonaría "mi mi amor".
  return opciones[indice]
    .replace('mi {apodo}', /^mi\s/i.test(nombre) ? '{apodo}' : 'mi {apodo}')
    .replace('{apodo}', nombre)
    .replace(/([¡¿])(\p{Ll})/gu, (_, signo, letra) => signo + letra.toUpperCase());
}
