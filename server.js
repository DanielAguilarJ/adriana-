// Voz de Mamá — servidor sin dependencias (Node 18+).
// Sirve /public y entrega tokens para hablar con el agente de ElevenLabs.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from './lib/config.js';
import { crearApp } from './lib/app.js';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const config = cargarConfig({ raiz });

const app = crearApp({
  apiKey: config.apiKey,
  agentId: config.agentId,
  dirPublico: path.join(raiz, 'public'),
  version: config.version,
});

// Igual que la versión que ya corre en Vercel: el módulo solo escucha, no exporta nada.
http.createServer(app).listen(config.puerto, config.host, () => console.log(`Voz de Mamá en http://localhost:${config.puerto}`));
