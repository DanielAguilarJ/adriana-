// Después de colgar, ElevenLabs analiza la plática (unos segundos). Aquí se pide ese
// análisis y se guarda en el teléfono: resumen, pendientes y datos nuevos.
import { actualizarPlatica, fusionarDatos } from './memoria.js';

const ESPERA_ENTRE_INTENTOS_MS = 4000;
const INTENTOS_TRAS_COLGAR = 30; // ~2 minutos
const VIDA_PENDIENTE_MS = 3 * 24 * 3600_000;

async function consultar(id) {
  const r = await fetch(`/api/memoria?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 400) return { estado: 'descartada' };
  if (r.status === 202) return { estado: 'procesando' };
  if (!r.ok) throw new Error(`memoria ${r.status}`);
  return r.json();
}

/** Aplica el resultado al almacén. Devuelve el estado final de esa plática. */
function aplicar(almacen, id, resultado) {
  const platicas = almacen.leer('platicas', []);
  if (resultado.estado === 'lista') {
    almacen.guardar('platicas', actualizarPlatica(platicas, id, {
      estado: 'lista',
      resumen: resultado.resumen,
      pendientes: resultado.pendientes,
      animo: resultado.animo,
      riesgo: resultado.riesgo === true,
      duracion: resultado.duracion,
    }));
    almacen.guardar('datos', fusionarDatos(almacen.leer('datos', []), resultado.datosNuevos));
  } else if (resultado.estado === 'descartada' || resultado.estado === 'fallida') {
    almacen.guardar('platicas', platicas.filter((p) => p.id !== id));
  }
  return resultado.estado;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Insiste hasta que la plática recién colgada esté analizada (o se agote el tiempo). */
export async function esperarMemoria(almacen, id, { intentos = INTENTOS_TRAS_COLGAR } = {}) {
  await esperar(ESPERA_ENTRE_INTENTOS_MS);
  for (let i = 0; i < intentos; i++) {
    try {
      const estado = aplicar(almacen, id, await consultar(id));
      if (estado !== 'procesando') return estado;
    } catch (e) {
      console.warn('Memoria aún no disponible:', e.message);
    }
    await esperar(ESPERA_ENTRE_INTENTOS_MS);
  }
  return 'procesando';
}

/** Al abrir la app, recupera las pláticas que quedaron sin analizar (p. ej. si cerró la pestaña). */
export async function recuperarPendientes(almacen, ahora = Date.now()) {
  const pendientes = almacen.leer('platicas', []).filter((p) => p.estado === 'pendiente');
  for (const p of pendientes) {
    if (ahora - new Date(p.fecha).getTime() > VIDA_PENDIENTE_MS) {
      aplicar(almacen, p.id, { estado: 'descartada' });
      continue;
    }
    try {
      aplicar(almacen, p.id, await consultar(p.id));
    } catch (e) {
      console.warn('No se pudo recuperar una plática:', e.message);
    }
  }
}
