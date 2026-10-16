// Configuración del servidor. Las variables de entorno (o un archivo .env local)
// tienen prioridad; si no existen se usan los valores de producción de abajo.
import fs from 'node:fs';
import path from 'node:path';

// Por decisión del dueño del proyecto, la clave se queda en el repositorio para que la
// app hable sin configurar nada en Vercel. Para retirarla: define ELEVENLABS_API_KEY en
// Vercel, borra este valor y rota la clave en ElevenLabs.
const CLAVE_PRODUCCION = 'sk_08349228348b8cbd7f022142e54f10406cd0049015744cd4';
// Agente creado con `node agent/sync.mjs --crear` el 16-oct-2026 (agent/config.mjs).
const AGENTE_PRODUCCION = 'agent_0201m534ff0nfnzb0wfbkd8ngke4';

/** Lee KEY=valor de un .env sin pisar variables ya definidas. Devuelve un objeto nuevo. */
export function leerEnv(texto) {
  const valores = {};
  for (const linea of String(texto).split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) valores[m[1]] = m[2];
  }
  return valores;
}

export function cargarConfig({ raiz, env = process.env } = {}) {
  let local = {};
  try {
    local = leerEnv(fs.readFileSync(path.join(raiz, '.env'), 'utf8'));
  } catch {
    /* sin .env: se usan variables de entorno y valores por defecto */
  }
  const valor = (k) => env[k] || local[k];
  return {
    apiKey: valor('ELEVENLABS_API_KEY') || CLAVE_PRODUCCION,
    agentId: valor('ELEVENLABS_AGENT_ID') || AGENTE_PRODUCCION,
    puerto: Number(valor('PORT')) || 3000,
    // En local solo se escucha en esta máquina; en Vercel se deja como siempre.
    host: valor('HOST') || (env.VERCEL ? undefined : '127.0.0.1'),
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
  };
}
