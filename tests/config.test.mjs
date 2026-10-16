import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cargarConfig, leerEnv } from '../lib/config.js';

const sinEnv = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-mama-'));

test('leerEnv entiende KEY=valor e ignora comentarios', () => {
  assert.deepEqual(leerEnv('# nota\nA=1\n B = dos \nmal linea\n'), { A: '1', B: 'dos' });
});

test('las variables de entorno ganan a los valores por defecto', () => {
  const c = cargarConfig({ raiz: sinEnv, env: { ELEVENLABS_API_KEY: 'sk_env', ELEVENLABS_AGENT_ID: 'agent_env', PORT: '4000' } });
  assert.equal(c.apiKey, 'sk_env');
  assert.equal(c.agentId, 'agent_env');
  assert.equal(c.puerto, 4000);
});

test('sin configuración usa la clave y el agente de producción', () => {
  const c = cargarConfig({ raiz: sinEnv, env: {} });
  assert.match(c.apiKey, /^sk_/);
  assert.match(c.agentId, /^agent_/);
});

test('en local solo escucha en esta máquina; en Vercel no fija host', () => {
  assert.equal(cargarConfig({ raiz: sinEnv, env: {} }).host, '127.0.0.1');
  assert.equal(cargarConfig({ raiz: sinEnv, env: { VERCEL: '1' } }).host, undefined);
  assert.equal(cargarConfig({ raiz: sinEnv, env: { HOST: '0.0.0.0' } }).host, '0.0.0.0');
});
