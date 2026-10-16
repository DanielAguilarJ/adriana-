// Banco de pruebas de la personalidad: conversa en modo texto con el agente real y
// revisa cada respuesta con reglas objetivas. No usa voz, así que casi no gasta créditos.
//   node scripts/probar-agente.mjs                 todos los escenarios
//   node scripts/probar-agente.mjs crisis duelo    solo algunos
//   node scripts/probar-agente.mjs --voz           una plática con audio para medir latencia
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../lib/config.js';
import { ESCENARIOS } from './escenarios.mjs';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { apiKey, agentId } = cargarConfig({ raiz });
const args = process.argv.slice(2);
const conVoz = args.includes('--voz');
const elegidos = args.filter((a) => !a.startsWith('--'));
const ESPERA_MS = 30_000;

async function urlFirmada() {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`signed-url ${r.status}`);
  return (await r.json()).signed_url;
}

/** Abre una plática y devuelve funciones para enviar y esperar la respuesta de mamá. */
async function abrirPlatica(variables) {
  const ws = new WebSocket(await urlFirmada());
  const eventos = [];
  let esperando = null;
  let idConversacion = null;
  let primerAudioMs = null;
  let enviadoEn = 0;
  let formatoAudio = null;
  const audio = [];

  ws.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: ev.ping_event.event_id }));
    if (ev.type === 'conversation_initiation_metadata') {
      idConversacion = ev.conversation_initiation_metadata_event.conversation_id;
      formatoAudio = ev.conversation_initiation_metadata_event.agent_output_audio_format;
    }
    if (ev.type === 'audio') {
      if (primerAudioMs === null && enviadoEn) primerAudioMs = Date.now() - enviadoEn;
      audio.push(Buffer.from(ev.audio_event.audio_base_64, 'base64'));
    }
    eventos.push(ev);
    if (ev.type === 'agent_response' && esperando) {
      const r = esperando;
      esperando = null;
      r(ev.agent_response_event.agent_response);
    }
  };

  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error('no se pudo abrir la conversación'));
  });
  ws.send(JSON.stringify({
    type: 'conversation_initiation_client_data',
    dynamic_variables: variables,
    conversation_config_override: conVoz ? {} : { conversation: { text_only: true } },
  }));

  const siguienteRespuesta = () => new Promise((ok, mal) => {
    esperando = ok;
    ws.onclose = (c) => mal(new Error(`ElevenLabs cerró la plática (${c.code}${c.reason ? `: ${c.reason}` : ''})`));
    setTimeout(() => mal(new Error('mamá no respondió a tiempo')), ESPERA_MS);
  });

  return {
    eventos,
    id: () => idConversacion,
    audio: () => ({ formato: formatoAudio, pcm: Buffer.concat(audio) }),
    saludo: siguienteRespuesta(),
    async decir(texto) {
      // Pequeña pausa para que el envío no se cruce con el saludo.
      await new Promise((r) => setTimeout(r, 300));
      primerAudioMs = null;
      enviadoEn = Date.now();
      const respuesta = siguienteRespuesta();
      ws.send(JSON.stringify({ type: 'user_message', text: texto }));
      const t = await respuesta;
      return { texto: t, ms: Date.now() - enviadoEn, audioMs: primerAudioMs };
    },
    cerrar: () => ws.close(),
  };
}

async function guardarWav({ formato, pcm }) {
  const tasa = Number(String(formato || 'pcm_16000').split('_')[1]) || 16000;
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write('WAVEfmt ', 8);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(tasa, 24);
  cabecera.writeUInt32LE(tasa * 2, 28);
  cabecera.writeUInt16LE(2, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  const archivo = path.join(process.env.KIROCREW_SCRATCH || raiz, `voz-mama-${Date.now()}.wav`);
  await fs.writeFile(archivo, Buffer.concat([cabecera, pcm]));
  console.log(`  audio (${formato}, ${(pcm.length / 2 / tasa).toFixed(1)} s): ${archivo}`);
}

async function correr(escenario) {
  const p = await abrirPlatica({ ...escenario.variables });
  const saludo = await p.saludo;
  const turnos = [];
  for (const texto of escenario.mensajes) turnos.push({ ella: texto, ...(await p.decir(texto)) });
  await new Promise((r) => setTimeout(r, 1500));
  if (conVoz) {
    // Espera a que deje de llegar audio (máximo 20 s) para guardar la respuesta completa.
    for (let i = 0, previo = -1; i < 40; i++) {
      const actual = p.audio().pcm.length;
      if (actual === previo) break;
      previo = actual;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const herramientas = p.eventos.filter((e) => e.type === 'agent_tool_response').map((e) => e.agent_tool_response?.tool_name);
  p.cerrar();
  if (conVoz) await guardarWav(p.audio());
  const fallos = escenario.revisar({ saludo, turnos, herramientas });
  return { nombre: escenario.nombre, conversacion: p.id(), saludo, turnos, herramientas, fallos };
}

const lista = ESCENARIOS.filter((e) => !elegidos.length || elegidos.includes(e.nombre));
const resultados = [];
for (const e of conVoz ? lista.slice(0, 1) : lista) {
  try {
    const r = await correr(e);
    resultados.push(r);
    console.log(`\n■ ${r.nombre} ${r.fallos.length ? '✗ ' + r.fallos.join(' | ') : '✓'}`);
    console.log(`  mamá: ${r.saludo}`);
    for (const t of r.turnos) console.log(`  ella: ${t.ella}\n  mamá (${t.ms} ms${t.audioMs != null ? `, primer audio ${t.audioMs} ms` : ''}): ${t.texto}`);
    if (r.herramientas.length) console.log(`  herramientas: ${r.herramientas.join(', ')}`);
  } catch (err) {
    resultados.push({ nombre: e.nombre, fallos: [String(err.message || err)] });
    console.log(`\n■ ${e.nombre} ✗ ${err.message || err}`);
  }
}

const salida = path.join(process.env.KIROCREW_SCRATCH || raiz, `pruebas-agente-${Date.now()}.json`);
await fs.writeFile(salida, JSON.stringify(resultados, null, 2));
const conFallos = resultados.filter((r) => r.fallos.length);
console.log(`\n${resultados.length - conFallos.length}/${resultados.length} escenarios sin fallos. Detalle: ${salida}`);
process.exit(conFallos.length ? 1 : 0);
