# Voz de Mamá

Web de conversación: hablas y se reproduce con una voz de ElevenLabs.

## Uso
1. `cp .env.example .env` y rellena `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`.
2. `npm start` (Node 18+)
3. Abre http://localhost:3000, pulsa el micrófono y habla (Chrome, Edge o Safari).

La API key solo la usa el servidor (`server.js`); nunca llega al navegador.
