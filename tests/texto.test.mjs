import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarEtiquetas, formatearDuracion, describirHace, mensajeDeCorte } from '../public/js/texto.js';

test('limpiarEtiquetas quita las etiquetas de voz y deja el texto limpio', () => {
  assert.equal(
    limpiarEtiquetas('[soft chuckle] Ay, mi amor. [warmly] Me da gusto.'),
    'Ay, mi amor. Me da gusto.',
  );
  assert.equal(limpiarEtiquetas('Hola [sighs] mija'), 'Hola mija');
  assert.equal(limpiarEtiquetas('  [laughs]  '), '');
});

test('limpiarEtiquetas no toca texto sin etiquetas ni valores vacíos', () => {
  assert.equal(limpiarEtiquetas('¿Ya comiste, mi niña?'), '¿Ya comiste, mi niña?');
  assert.equal(limpiarEtiquetas(''), '');
  assert.equal(limpiarEtiquetas(undefined), '');
});

test('formatearDuracion muestra minutos y segundos como en una llamada', () => {
  assert.equal(formatearDuracion(0), '0:00');
  assert.equal(formatearDuracion(9), '0:09');
  assert.equal(formatearDuracion(75), '1:15');
  assert.equal(formatearDuracion(3725), '1:02:05');
  assert.equal(formatearDuracion(-5), '0:00');
});

test('describirHace habla en español natural', () => {
  const ahora = new Date('2026-10-16T21:00:00');
  const hace = (ms) => new Date(ahora.getTime() - ms).toISOString();
  const MIN = 60_000;
  const HORA = 60 * MIN;
  const DIA = 24 * HORA;
  assert.equal(describirHace(hace(30_000), ahora), 'hace un momento');
  assert.equal(describirHace(hace(1 * MIN), ahora), 'hace un minuto');
  assert.equal(describirHace(hace(20 * MIN), ahora), 'hace 20 minutos');
  assert.equal(describirHace(hace(1 * HORA), ahora), 'hace una hora');
  assert.equal(describirHace(hace(3 * HORA), ahora), 'hace 3 horas');
  assert.equal(describirHace(hace(1 * DIA), ahora), 'ayer');
  assert.equal(describirHace(hace(3 * DIA), ahora), 'hace 3 días');
  assert.equal(describirHace(hace(8 * DIA), ahora), 'hace una semana');
  assert.equal(describirHace(hace(15 * DIA), ahora), 'hace 2 semanas');
  assert.equal(describirHace(hace(35 * DIA), ahora), 'hace un mes');
  assert.equal(describirHace(hace(70 * DIA), ahora), 'hace 2 meses');
});

test('describirHace tolera fechas inválidas', () => {
  assert.equal(describirHace('no es fecha', new Date()), 'hace un tiempo');
});

test('mensajeDeCorte explica la causa sin tecnicismos', () => {
  assert.match(mensajeDeCorte({ reason: 'error', closeReason: 'quota_exceeded' }), /minutos de este mes/);
  assert.match(mensajeDeCorte({ reason: 'error', message: 'Insufficient credits' }), /minutos de este mes/);
  assert.match(mensajeDeCorte({ reason: 'error', closeReason: 'Daily conversation limit reached' }), /más tarde/);
  assert.match(mensajeDeCorte({ reason: 'error', message: 'socket closed' }), /Se cortó la llamada/);
  assert.equal(mensajeDeCorte({ reason: 'user' }), null);
  assert.equal(mensajeDeCorte({ reason: 'agent' }), null);
  assert.equal(mensajeDeCorte(undefined), null);
});
