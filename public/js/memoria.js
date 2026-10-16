// Memoria de mamá: vive solo en el teléfono de Adriana (localStorage).
// Las funciones son puras (devuelven copias nuevas) para poder probarlas en Node.
import { describirHace } from './texto.js';
import { franjaDelDia } from './saludos.js';

export const LIMITES = Object.freeze({
  campoPerfil: 1500,
  platicas: 20,
  datos: 60,
  dato: 200,
  recuerdos: 4000,
  ultimasPlaticas: 2000,
  platicasEnPrompt: 4,
});

const CAMPOS_PERFIL = ['nombreHija', 'apodos', 'nombreMama', 'frases', 'familia', 'recuerdos'];
const NOMBRE_POR_DEFECTO = 'Adriana';
const APODOS_POR_DEFECTO = 'mi amor, mi niña, mija';
const SIN_RECUERDOS = 'Todavía no tienes notas guardadas sobre ella; deja que ella te cuente y escúchala con cariño.';
const SIN_PLATICAS = 'No hay notas de pláticas anteriores.';
const VACIOS = /^(ninguno|ninguna|nada|n\/a|no|none|sin datos)\.?$/i;

const texto = (v, max) => String(v ?? '').replace(/\{\{|\}\}/g, '').trim().slice(0, max);

export function normalizarPerfil(perfil) {
  const fuente = perfil && typeof perfil === 'object' ? perfil : {};
  const limpio = Object.fromEntries(CAMPOS_PERFIL.map((c) => [c, texto(fuente[c], LIMITES.campoPerfil)]));
  return { ...limpio, nombreHija: limpio.nombreHija || NOMBRE_POR_DEFECTO };
}

export function agregarPlatica(platicas, nueva, max = LIMITES.platicas) {
  const resto = (platicas || []).filter((p) => p.id !== nueva.id);
  return [{ ...nueva }, ...resto].slice(0, max);
}

export function actualizarPlatica(platicas, id, cambios) {
  return (platicas || []).map((p) => (p.id === id ? { ...p, ...cambios } : p));
}

const clave = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Añade los datos nuevos ("a; b; c") sin repetir; conserva los más recientes. */
export function fusionarDatos(datos, nuevosTexto, max = LIMITES.datos) {
  const previos = [...(datos || [])];
  const vistos = new Set(previos.map(clave));
  const nuevos = String(nuevosTexto ?? '')
    .split(/[;\n]/)
    .map((d) => texto(d, LIMITES.dato).replace(/\.$/, ''))
    .filter((d) => d && !VACIOS.test(d));
  for (const d of nuevos) {
    const k = clave(d);
    if (k && !vistos.has(k)) {
      vistos.add(k);
      previos.push(d);
    }
  }
  return previos.slice(-max);
}

export function describirMomento(fecha = new Date()) {
  const dia = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
  const hora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true }).format(fecha);
  return `${dia.replace(',', '')}, ${hora} (${franjaDelDia(fecha.getHours())})`;
}

function seccion(titulo, valor) {
  return valor ? `${titulo}: ${valor}` : '';
}

function recortar(textoLargo, max) {
  if (textoLargo.length <= max) return textoLargo;
  return `${textoLargo.slice(0, max - 1).trimEnd()}…`;
}

function construirRecuerdos(perfil, datos) {
  const partes = [
    seccion('Tu hija se llama', perfil.nombreHija),
    seccion('Tu nombre', perfil.nombreMama),
    seccion('Cómo le dices de cariño', perfil.apodos),
    seccion('Cosas que tú decías o hacías', perfil.frases),
    seccion('Familia y personas importantes', perfil.familia),
    seccion('Recuerdos que ella quiere que tengas presentes', perfil.recuerdos),
  ];
  const aprendidos = (datos || []).slice().reverse().map((d) => `- ${texto(d, LIMITES.dato)}`);
  if (aprendidos.length) partes.push(`Cosas que ella te ha contado en otras llamadas:\n${aprendidos.join('\n')}`);
  const conContenido = partes.filter(Boolean);
  // Solo el nombre de la hija no cuenta como recuerdo.
  if (conContenido.length <= 1) return SIN_RECUERDOS;
  return recortar(conContenido.join('\n'), LIMITES.recuerdos);
}

function construirUltimasPlaticas(platicas, ahora) {
  const listas = (platicas || []).filter((p) => p.estado === 'lista' && p.resumen).slice(0, LIMITES.platicasEnPrompt);
  if (!listas.length) return SIN_PLATICAS;
  const lineas = listas.map((p) => {
    const cuando = describirHace(p.fecha, ahora);
    const pendiente = p.pendientes && !VACIOS.test(p.pendientes.trim()) ? ` Quedó pendiente: ${texto(p.pendientes, 300)}.` : '';
    const animo = p.animo ? ` Ánimo: ${texto(p.animo, 40)}.` : '';
    return `- ${cuando}: ${texto(p.resumen, 600)}${pendiente}${animo}`;
  });
  return recortar(lineas.join('\n'), LIMITES.ultimasPlaticas);
}

/** Variables dinámicas que recibe el agente al iniciar la llamada (todas texto). */
export function construirVariables({ perfil, platicas, datos, fecha = new Date(), saludo }) {
  const p = normalizarPerfil(perfil);
  return {
    nombre_hija: p.nombreHija,
    apodos: p.apodos || APODOS_POR_DEFECTO,
    recuerdos: construirRecuerdos(p, datos),
    ultimas_platicas: construirUltimasPlaticas(platicas, fecha),
    momento: describirMomento(fecha),
    saludo: texto(saludo, 300) || '¿Bueno? ¡Hola, mi amor!',
  };
}

/** ¿La plática más reciente ya analizada mostró señales de riesgo? */
export function ultimaPlaticaConRiesgo(platicas) {
  const ultima = (platicas || []).find((p) => p.estado === 'lista');
  return Boolean(ultima && ultima.riesgo === true);
}

const PREFIJO = 'mama.v2.';

/** Envoltorio de localStorage que nunca lanza: si falla, devuelve el valor por defecto. */
export function crearAlmacen(storage = globalThis.localStorage) {
  return {
    leer(nombre, porDefecto) {
      try {
        const crudo = storage?.getItem(PREFIJO + nombre);
        return crudo == null ? porDefecto : JSON.parse(crudo);
      } catch {
        return porDefecto;
      }
    },
    guardar(nombre, valor) {
      try {
        storage.setItem(PREFIJO + nombre, JSON.stringify(valor));
        return true;
      } catch {
        return false;
      }
    },
    borrar(nombre) {
      try {
        storage.removeItem(PREFIJO + nombre);
      } catch {
        /* sin almacenamiento disponible: nada que borrar */
      }
    },
  };
}
