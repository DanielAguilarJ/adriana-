import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerMemoria, esIdConversacion } from '../lib/memoria.js';
import { crearLimitador } from '../lib/rate-limit.js';

const AGENTE = 'agent_mama';
const valor = (v) => ({ value: v, rationale: 'x' });
const conversacion = (extra = {}) => ({
  agent_id: AGENTE,
  conversation_id: 'conv_abc123def456',
  status: 'done',
  transcript: [{ role: 'user', message: 'secreto que no debe salir' }],
  metadata: { start_time_unix_secs: 1792180000, call_duration_secs: 312 },
  analysis: {
    transcript_summary: 'Resumen genérico.',
    data_collection_results: {
      resumen: valor('Adriana contó que tuvo un día pesado en el hospital.'),
      pendientes: valor('Entrevista el lunes'),
      datos_nuevos: valor('Trabaja en un hospital; su perro se llama Canela'),
      animo: valor('cansada'),
      riesgo: valor(false),
    },
  },
  ...extra,
});

test('esIdConversacion acepta ids reales y rechaza basura', () => {
  assert.equal(esIdConversacion('conv_abc123def456'), true);
  assert.equal(esIdConversacion('conv_8201k7r2p0mzf1gvh7q3c4b5n6x8'), true);
  for (const malo of ['', 'abc', 'conv_', 'conv_../../x', 'conv_a b', 'agent_123456789', null, 42, 'conv_' + 'a'.repeat(200)]) {
    assert.equal(esIdConversacion(malo), false, String(malo));
  }
});

test('extraerMemoria rechaza conversaciones de otros agentes de la cuenta', () => {
  const r = extraerMemoria(conversacion({ agent_id: 'agent_de_otro_negocio' }), AGENTE);
  assert.equal(r.estado, 'ajena');
  assert.equal(r.resumen, undefined);
});

test('extraerMemoria avisa mientras ElevenLabs sigue procesando', () => {
  for (const status of ['initiated', 'in-progress', 'processing']) {
    assert.deepEqual(extraerMemoria(conversacion({ status }), AGENTE), { estado: 'procesando' });
  }
  assert.deepEqual(extraerMemoria(conversacion({ status: 'failed' }), AGENTE), { estado: 'fallida' });
});

test('extraerMemoria devuelve solo lo necesario y nunca la transcripción', () => {
  const r = extraerMemoria(conversacion(), AGENTE);
  assert.equal(r.estado, 'lista');
  assert.equal(r.resumen, 'Adriana contó que tuvo un día pesado en el hospital.');
  assert.equal(r.pendientes, 'Entrevista el lunes');
  assert.equal(r.datosNuevos, 'Trabaja en un hospital; su perro se llama Canela');
  assert.equal(r.animo, 'cansada');
  assert.equal(r.riesgo, false);
  assert.equal(r.duracion, 312);
  assert.equal(r.inicio, new Date(1792180000 * 1000).toISOString());
  assert.doesNotMatch(JSON.stringify(r), /secreto/);
});

test('extraerMemoria normaliza el riesgo aunque llegue como texto', () => {
  const con = (v) => conversacion({ analysis: { data_collection_results: { riesgo: valor(v) } } });
  for (const si of [true, 'true', 'True', 'sí', 'si', 'yes']) assert.equal(extraerMemoria(con(si), AGENTE).riesgo, true, String(si));
  for (const no of [false, 'false', 'no', null, undefined, '']) assert.equal(extraerMemoria(con(no), AGENTE).riesgo, false, String(no));
});

test('extraerMemoria usa el resumen general si falta el propio y limita longitudes', () => {
  const r = extraerMemoria(conversacion({
    analysis: { transcript_summary: 'Resumen general.', data_collection_results: { datos_nuevos: valor('d'.repeat(5000)) } },
  }), AGENTE);
  assert.equal(r.resumen, 'Resumen general.');
  assert.equal(r.pendientes, '');
  assert.ok(r.datosNuevos.length <= 800);
});

test('extraerMemoria tolera respuestas incompletas sin romperse', () => {
  const r = extraerMemoria({ agent_id: AGENTE, status: 'done' }, AGENTE);
  assert.equal(r.estado, 'lista');
  assert.equal(r.resumen, '');
  assert.equal(r.duracion, 0);
  assert.equal(r.inicio, null);
  assert.equal(extraerMemoria(null, AGENTE).estado, 'ajena');
});

test('crearLimitador permite hasta el máximo por ventana y por clave', () => {
  let t = 0;
  const lim = crearLimitador({ max: 3, ventanaMs: 1000, ahora: () => t });
  assert.equal(lim.permitir('ip1'), true);
  assert.equal(lim.permitir('ip1'), true);
  assert.equal(lim.permitir('ip1'), true);
  assert.equal(lim.permitir('ip1'), false);
  assert.equal(lim.permitir('ip2'), true, 'otra clave es independiente');
  t = 1001;
  assert.equal(lim.permitir('ip1'), true, 'la ventana se reinicia');
});

test('crearLimitador no crece sin control con muchas claves', () => {
  let t = 0;
  const lim = crearLimitador({ max: 1, ventanaMs: 1000, maxClaves: 100, ahora: () => t });
  for (let i = 0; i < 500; i++) lim.permitir(`ip${i}`);
  assert.ok(lim.tamano() <= 100, `tamaño ${lim.tamano()}`);
});
