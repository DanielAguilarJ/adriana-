// Crea o actualiza el agente «Mamá» en ElevenLabs con agent/config.mjs.
//   node agent/sync.mjs            actualiza el agente de ELEVENLABS_AGENT_ID
//   node agent/sync.mjs --crear    crea uno nuevo y guarda su id en .env
//   node agent/sync.mjs --llm=gemini-3.8-flash --razonamiento=low   (para comparar modelos)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../lib/config.js';
import { construirAgente, MODELO_VOZ, VOZ_MAMA } from './config.mjs';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API = 'https://api.elevenlabs.io/v1/convai/agents';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

const { apiKey, agentId } = cargarConfig({ raiz });
const persona = await fs.readFile(path.join(raiz, 'agent', 'persona.md'), 'utf8');
const opciones = { persona };
if (typeof args.llm === 'string') opciones.llm = args.llm;
if (typeof args.razonamiento === 'string') opciones.razonamiento = args.razonamiento === 'ninguno' ? null : args.razonamiento;
const cuerpo = construirAgente(opciones);

async function llamar(metodo, url, datos) {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: datos ? JSON.stringify(datos) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(`ElevenLabs respondió ${r.status}:`, JSON.stringify(json, null, 2).slice(0, 3000));
    process.exit(1);
  }
  return json;
}

async function guardarIdEnEnv(id) {
  const archivo = path.join(raiz, '.env');
  const actual = await fs.readFile(archivo, 'utf8').catch(() => '');
  const linea = `ELEVENLABS_AGENT_ID=${id}`;
  const nuevo = /^ELEVENLABS_AGENT_ID=/m.test(actual) ? actual.replace(/^ELEVENLABS_AGENT_ID=.*$/m, linea) : `${actual.trimEnd()}\n${linea}\n`;
  await fs.writeFile(archivo, nuevo);
}

let id = agentId;
if (args.crear) {
  const creado = await llamar('POST', `${API}/create`, cuerpo);
  id = creado.agent_id;
  await guardarIdEnEnv(id);
  console.log('Agente creado:', id);
} else {
  await llamar('PATCH', `${API}/${encodeURIComponent(id)}`, cuerpo);
  console.log('Agente actualizado:', id);
}

// Se relee lo que quedó guardado: lo que importa es lo aplicado, no lo enviado.
const vivo = await llamar('GET', `${API}/${encodeURIComponent(id)}`);
const cc = vivo.conversation_config;
const ps = vivo.platform_settings;
const revision = {
  voz: cc.tts.voice_id === VOZ_MAMA,
  modelo_voz: cc.tts.model_id === MODELO_VOZ,
  llm: cc.agent.prompt.llm,
  prompt_igual: cc.agent.prompt.prompt === persona,
  saludo_dinamico: cc.agent.first_message === '{{saludo}}',
  auth: ps.auth?.enable_auth === true,
  sin_grabar_audio: ps.privacy?.record_voice === false,
  memoria_al_colgar: Object.keys(ps.data_collection || {}).sort().join(','),
  autolesion_no_cuelga: ps.guardrails?.content?.config?.self_harm?.is_enabled !== true,
  end_call: Boolean(cc.agent.prompt.built_in_tools?.end_call),
  skip_turn: Boolean(cc.agent.prompt.built_in_tools?.skip_turn),
};
console.log(JSON.stringify(revision, null, 1));
const fallos = Object.entries(revision).filter(([, v]) => v === false);
if (fallos.length) {
  console.error('No quedó como se esperaba:', fallos.map(([k]) => k).join(', '));
  process.exit(2);
}
