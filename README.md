# Voz de Mamá

Llamada de voz en tiempo real: hablas y un agente de ElevenLabs te responde con una voz clonada.

## Uso
1. `cp .env.example .env` y rellena `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`.
2. `node create-agent.mjs` (crea el agente y guarda `ELEVENLABS_AGENT_ID` en `.env`). Edita `persona.txt` antes si quieres cambiar su forma de hablar.
3. `npm start` (Node 18+) y abre http://localhost:3000.
4. Pulsa el micrófono y platica.

La API key solo la usa el servidor (`server.js`); nunca llega al navegador.
