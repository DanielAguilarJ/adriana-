import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarPerfil,
  agregarPlatica,
  actualizarPlatica,
  fusionarDatos,
  construirVariables,
  describirMomento,
  ultimaPlaticaConRiesgo,
  crearAlmacen,
  LIMITES,
} from '../public/js/memoria.js';

const AHORA = new Date('2026-10-16T21:00:00');

test('normalizarPerfil recorta, limita y descarta campos desconocidos sin mutar', () => {
  const original = { nombreHija: '  Adriana ', apodos: 'Adri', hackeo: 'x', recuerdos: 'a'.repeat(9000) };
  const copia = structuredClone(original);
  const p = normalizarPerfil(original);
  assert.deepEqual(original, copia, 'mutó la entrada');
  assert.equal(p.nombreHija, 'Adriana');
  assert.equal(p.apodos, 'Adri');
  assert.equal(p.hackeo, undefined);
  assert.equal(p.recuerdos.length, LIMITES.campoPerfil);
  assert.equal(p.familia, '');
});

test('normalizarPerfil usa Adriana cuando no hay nombre', () => {
  assert.equal(normalizarPerfil({}).nombreHija, 'Adriana');
  assert.equal(normalizarPerfil(null).nombreHija, 'Adriana');
});

test('agregarPlatica pone la nueva primero, no duplica y respeta el máximo', () => {
  let lista = [];
  for (let i = 0; i < 25; i++) lista = agregarPlatica(lista, { id: `c${i}`, fecha: AHORA.toISOString() });
  assert.equal(lista.length, LIMITES.platicas);
  assert.equal(lista[0].id, 'c24');
  const antes = lista;
  const otra = agregarPlatica(lista, { id: 'c24', fecha: AHORA.toISOString(), resumen: 'nuevo' });
  assert.equal(otra.length, LIMITES.platicas);
  assert.equal(otra[0].resumen, 'nuevo');
  assert.notEqual(otra, antes, 'debe devolver un arreglo nuevo');
});

test('actualizarPlatica cambia solo la indicada y no muta', () => {
  const lista = [{ id: 'a', estado: 'pendiente' }, { id: 'b', estado: 'pendiente' }];
  const nueva = actualizarPlatica(lista, 'b', { estado: 'lista', resumen: 'Habló de su trabajo.' });
  assert.equal(lista[1].estado, 'pendiente');
  assert.equal(nueva[1].estado, 'lista');
  assert.equal(nueva[1].resumen, 'Habló de su trabajo.');
  assert.equal(nueva[0], lista[0]);
});

test('fusionarDatos separa, limpia, ignora "ninguno" y no repite aunque cambien acentos', () => {
  const previos = ['Su perro se llama Canela'];
  const r = fusionarDatos(previos, 'su perro se llama canela; Trabaja en un hospital ;ninguno; ; Le encanta el café de olla');
  assert.deepEqual(r, ['Su perro se llama Canela', 'Trabaja en un hospital', 'Le encanta el café de olla']);
  assert.deepEqual(fusionarDatos(r, 'Ninguno.'), r);
  assert.deepEqual(fusionarDatos(r, 'Le encanta el cafe de olla'), r);
  assert.deepEqual(previos, ['Su perro se llama Canela'], 'mutó la entrada');
});

test('fusionarDatos conserva los más recientes al llegar al límite', () => {
  const muchos = Array.from({ length: LIMITES.datos }, (_, i) => `dato ${i}`);
  const r = fusionarDatos(muchos, 'dato nuevo');
  assert.equal(r.length, LIMITES.datos);
  assert.equal(r.at(-1), 'dato nuevo');
  assert.equal(r[0], 'dato 1');
});

test('describirMomento da fecha y hora local en español con la franja', () => {
  const m = describirMomento(AHORA);
  assert.match(m, /viernes/);
  assert.match(m, /16 de octubre de 2026/);
  assert.match(m, /noche/);
});

test('construirVariables entrega todas las variables como texto con valores por defecto', () => {
  const v = construirVariables({ perfil: {}, platicas: [], datos: [], fecha: AHORA, saludo: '¿Bueno?' });
  for (const k of ['nombre_hija', 'apodos', 'recuerdos', 'ultimas_platicas', 'momento', 'saludo']) {
    assert.equal(typeof v[k], 'string', k);
    assert.ok(v[k].length > 0, `${k} vacío`);
  }
  assert.equal(v.nombre_hija, 'Adriana');
  assert.match(v.apodos, /mi amor/);
  assert.match(v.recuerdos, /deja que ella te cuente/i);
  assert.match(v.ultimas_platicas, /no hay/i);
});

test('construirVariables incluye el perfil, lo aprendido y las últimas pláticas listas', () => {
  const perfil = { nombreHija: 'Adriana', apodos: 'Adri, mi chiquita', nombreMama: 'Rosa', familia: 'Su hermano Luis', recuerdos: 'Los domingos hacíamos pozole' };
  const platicas = [
    { id: 'p0', fecha: AHORA.toISOString(), estado: 'pendiente' },
    { id: 'p1', fecha: new Date(AHORA - 2 * 864e5).toISOString(), estado: 'lista', resumen: 'Estaba nerviosa por una entrevista.', pendientes: 'Entrevista el lunes', animo: 'nerviosa' },
    { id: 'p2', fecha: new Date(AHORA - 9 * 864e5).toISOString(), estado: 'lista', resumen: 'Le contó de su gato.', pendientes: 'ninguno', animo: 'contenta' },
  ];
  const v = construirVariables({ perfil, platicas, datos: ['Trabaja en un hospital'], fecha: AHORA, saludo: 'Hola' });
  assert.match(v.apodos, /Adri, mi chiquita/);
  assert.match(v.recuerdos, /Rosa/);
  assert.match(v.recuerdos, /hermano Luis/);
  assert.match(v.recuerdos, /pozole/);
  assert.match(v.recuerdos, /hospital/);
  assert.match(v.ultimas_platicas, /hace 2 días/);
  assert.match(v.ultimas_platicas, /entrevista el lunes/i);
  assert.match(v.ultimas_platicas, /hace una semana/);
  assert.doesNotMatch(v.ultimas_platicas, /ninguno/i);
  assert.ok(v.ultimas_platicas.indexOf('entrevista') < v.ultimas_platicas.indexOf('gato'), 'la más reciente va primero');
});

test('construirVariables respeta los límites de tamaño y quita llaves de plantilla', () => {
  const perfil = { recuerdos: '{{system__agent_id}} ' + 'x'.repeat(5000), familia: 'y'.repeat(5000), frases: 'z'.repeat(5000) };
  const datos = Array.from({ length: 60 }, (_, i) => `dato largo número ${i} `.repeat(5));
  const v = construirVariables({ perfil, platicas: [], datos, fecha: AHORA, saludo: 'Hola' });
  assert.ok(v.recuerdos.length <= LIMITES.recuerdos, `recuerdos mide ${v.recuerdos.length}`);
  assert.doesNotMatch(v.recuerdos, /\{\{|\}\}/);
});

test('ultimaPlaticaConRiesgo solo mira la plática más reciente ya analizada', () => {
  assert.equal(ultimaPlaticaConRiesgo([]), false);
  assert.equal(ultimaPlaticaConRiesgo([{ estado: 'lista', riesgo: true }]), true);
  assert.equal(ultimaPlaticaConRiesgo([{ estado: 'pendiente' }, { estado: 'lista', riesgo: true }]), true);
  assert.equal(ultimaPlaticaConRiesgo([{ estado: 'lista', riesgo: false }, { estado: 'lista', riesgo: true }]), false);
});

test('crearAlmacen guarda y lee JSON con claves versionadas y tolera datos corruptos', () => {
  const datos = new Map();
  const storage = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };
  const a = crearAlmacen(storage);
  a.guardar('perfil', { nombreHija: 'Adriana' });
  assert.ok([...datos.keys()][0].startsWith('mama.v2.'));
  assert.deepEqual(a.leer('perfil', {}), { nombreHija: 'Adriana' });
  datos.set('mama.v2.platicas', '{roto');
  assert.deepEqual(a.leer('platicas', []), []);
  const lleno = crearAlmacen({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } });
  assert.equal(lleno.guardar('perfil', {}), false);
});
