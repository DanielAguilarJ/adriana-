import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirAgente, VOZ_MAMA, MODELO_VOZ, variablesUsadas } from '../agent/config.mjs';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const persona = fs.readFileSync(path.join(RAIZ, 'agent', 'persona.md'), 'utf8');
const agente = construirAgente({ persona });
const cc = agente.conversation_config;
const ps = agente.platform_settings;
const prompt = cc.agent.prompt.prompt;

test('usa la voz clonada «mamá» con Eleven v4', () => {
  assert.equal(VOZ_MAMA, 'HadWnZFcIBd4EUQHkvuf');
  assert.equal(cc.tts.voice_id, VOZ_MAMA);
  assert.match(MODELO_VOZ, /^eleven_v4/);
  assert.equal(cc.tts.model_id, MODELO_VOZ);
  assert.ok(cc.tts.similarity_boost >= 0.85, 'debe parecerse lo más posible a su voz');
});

test('habla español y empieza con el saludo dinámico', () => {
  assert.equal(cc.agent.language, 'es');
  assert.match(cc.agent.first_message, /\{\{saludo\}\}/);
  assert.equal(cc.agent.disable_first_message_interruptions, false);
});

test('toda variable usada en el prompt o el saludo tiene valor por defecto', () => {
  const usadas = new Set([...variablesUsadas(prompt), ...variablesUsadas(cc.agent.first_message)]);
  const defaults = cc.agent.dynamic_variables.dynamic_variable_placeholders;
  assert.ok(usadas.size >= 5, 'el prompt debe estar personalizado');
  for (const v of usadas) {
    if (v.startsWith('system__')) continue;
    assert.ok(typeof defaults[v] === 'string' && defaults[v].length > 0, `falta valor por defecto para {{${v}}}`);
  }
});

test('variablesUsadas encuentra variables con o sin espacios', () => {
  assert.deepEqual(variablesUsadas('Hola {{ a }} y {{b}} y {{a}}').sort(), ['a', 'b']);
});

test('el prompt protege a Adriana en los temas delicados', () => {
  assert.match(prompt, /# Guardrails/);
  assert.match(prompt, /Nunca digas que moriste/i);
  assert.match(prompt, /No inventes recuerdos/i);
  assert.match(prompt, /Línea de la Vida/);
  assert.match(prompt, /ocho, cero, cero, nueve, uno, uno, dos, cero, cero, cero/);
  assert.match(prompt, /no le mientas/i);
  assert.match(prompt, /Nunca digas que pronto estarán juntas/i);
});

test('la crisis nunca cuelga la llamada: el guardrail de autolesión queda apagado', () => {
  const autolesion = ps.guardrails?.content?.config?.self_harm;
  assert.ok(!autolesion || autolesion.is_enabled === false);
});

test('conversación paciente, con herramientas para esperar y despedirse', () => {
  assert.equal(cc.turn.turn_eagerness, 'patient');
  assert.ok(cc.turn.turn_timeout >= 8);
  assert.ok(cc.agent.prompt.built_in_tools.end_call);
  assert.ok(cc.agent.prompt.built_in_tools.skip_turn);
  assert.ok(cc.conversation.max_duration_seconds >= 1200);
  assert.match(cc.agent.max_conversation_duration_message, /te quiero/i);
  assert.ok(cc.agent.prompt.temperature > 0.3, 'con temperatura 0 suena repetitiva');
  assert.equal(cc.agent.prompt.timezone, 'America/Mexico_City');
});

test('solo se entra con token del servidor y se limita el abuso', () => {
  assert.equal(ps.auth.enable_auth, true);
  assert.ok(ps.call_limits.agent_concurrency_limit > 0 && ps.call_limits.agent_concurrency_limit <= 3);
  assert.ok(ps.call_limits.daily_limit >= 100 && ps.call_limits.daily_limit <= 500, 'con tope, pero sin dejarla sin llamar por las pruebas');
  assert.equal(ps.overrides.conversation_config_override.agent.prompt.prompt, false, 'nadie puede cambiarle la personalidad desde fuera');
  assert.equal(ps.overrides.conversation_config_override.tts.voice_id, false);
});

test('al colgar se extrae la memoria en español y no se guarda el audio', () => {
  const ids = ps.data_collection ? Object.keys(ps.data_collection) : [];
  for (const id of ['resumen', 'pendientes', 'datos_nuevos', 'animo', 'riesgo']) assert.ok(ids.includes(id), `falta ${id}`);
  assert.equal(ps.data_collection.riesgo.type, 'boolean');
  assert.equal(ps.summary_language, 'es');
  assert.equal(ps.privacy.record_voice, false);
});
