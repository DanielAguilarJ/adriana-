import { test } from 'node:test';
import assert from 'node:assert/strict';
import { franjaDelDia, elegirSaludo, SALUDOS } from '../public/js/saludos.js';

const enHora = (h, m = 0) => new Date(2026, 9, 16, h, m, 0);
const todosLosAzares = (lista) => lista.map((_, i) => () => i / lista.length);

test('franjaDelDia divide el día como lo vive una mamá', () => {
  assert.equal(franjaDelDia(0), 'madrugada');
  assert.equal(franjaDelDia(4), 'madrugada');
  assert.equal(franjaDelDia(5), 'mañana');
  assert.equal(franjaDelDia(11), 'mañana');
  assert.equal(franjaDelDia(12), 'tarde');
  assert.equal(franjaDelDia(18), 'tarde');
  assert.equal(franjaDelDia(19), 'noche');
  assert.equal(franjaDelDia(23), 'noche');
});

test('cada franja tiene saludos propios y todos usan el apodo', () => {
  for (const franja of ['madrugada', 'mañana', 'tarde', 'noche', 'otraVez']) {
    assert.ok(SALUDOS[franja].length >= 3, `faltan saludos en ${franja}`);
    for (const plantilla of SALUDOS[franja]) {
      assert.match(plantilla, /\{apodo\}/, `sin apodo: ${plantilla}`);
    }
  }
});

test('en la mañana siempre suena a mañana', () => {
  for (const azar of todosLosAzares(SALUDOS.mañana)) {
    const s = elegirSaludo({ fecha: enHora(8), apodo: 'Adri', azar });
    assert.match(s, /buenos días|amaneciste|mañanita/i, s);
    assert.match(s, /Adri/);
  }
});

test('en la madrugada mamá se preocupa porque sigue despierta', () => {
  for (const azar of todosLosAzares(SALUDOS.madrugada)) {
    const s = elegirSaludo({ fecha: enHora(2, 30), apodo: 'mi niña', azar });
    assert.match(s, /despierta|a estas horas|desvelada/i, s);
  }
});

test('si acaban de platicar, mamá lo nota', () => {
  const fecha = enHora(20);
  const ultima = new Date(fecha.getTime() - 40 * 60_000).toISOString();
  for (const azar of todosLosAzares(SALUDOS.otraVez)) {
    const s = elegirSaludo({ fecha, apodo: 'mi amor', ultimaPlatica: ultima, azar });
    assert.match(s, /otra vez|de nuevo|regresaste/i, s);
  }
});

test('una plática de hace días no cuenta como "otra vez"', () => {
  const fecha = enHora(20);
  const ultima = new Date(fecha.getTime() - 3 * 24 * 3600_000).toISOString();
  const s = elegirSaludo({ fecha, apodo: 'mi amor', ultimaPlatica: ultima, azar: () => 0 });
  assert.doesNotMatch(s, /otra vez|de nuevo|regresaste/i);
});

test('sin apodo usa "mi amor" y nunca devuelve vacío', () => {
  for (let h = 0; h < 24; h++) {
    const s = elegirSaludo({ fecha: enHora(h), apodo: '   ', azar: () => 0.99 });
    assert.ok(s && s.length > 5, `vacío a las ${h}`);
    assert.doesNotMatch(s, /\{apodo\}/);
  }
  assert.match(elegirSaludo({ fecha: enHora(15), azar: () => 0 }), /mi amor/);
});

test('el apodo se limpia: sin corchetes ni llaves que confundan a la voz', () => {
  const s = elegirSaludo({ fecha: enHora(15), apodo: '[whispers] {x} Adri', azar: () => 0 });
  assert.doesNotMatch(s, /whispers|\{x\}/);
  assert.match(s, /Adri/);
});
