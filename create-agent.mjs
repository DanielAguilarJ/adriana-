// Crea (una vez) el agente conversacional de ElevenLabs con la voz clonada de mamá
// y guarda ELEVENLABS_AGENT_ID en .env.   Uso: node create-agent.mjs
import fs from 'node:fs/promises';

const env = await fs.readFile('.env', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const KEY = get('ELEVENLABS_API_KEY');
const VOICE = get('ELEVENLABS_VOICE_ID');
const persona = await fs.readFile('persona.txt', 'utf8');

const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Mamá',
    conversation_config: {
      agent: {
        language: 'es',
        first_message: '¡Hola, mi amor! ¿Cómo estás? Cuéntame, ¿cómo te ha ido?',
        prompt: { prompt: persona },
      },
      tts: { voice_id: VOICE, model_id: 'eleven_flash_v2_5', stability: 0.5, similarity_boost: 0.85 },
    },
  }),
});
const data = await r.json();
if (!r.ok) { console.error(r.status, JSON.stringify(data, null, 2)); process.exit(1); }

const line = `ELEVENLABS_AGENT_ID=${data.agent_id}`;
const next = /^ELEVENLABS_AGENT_ID=/m.test(env) ? env.replace(/^ELEVENLABS_AGENT_ID=.*$/m, line) : env.trimEnd() + '\n' + line + '\n';
await fs.writeFile('.env', next);
console.log('Agente creado:', data.agent_id);
