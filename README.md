# Voz de Mamá

Una llamada de voz en tiempo real para que Adriana siga platicando con su mamá, con su voz clonada («mamá») en ElevenLabs.

## Cómo funciona

```
Navegador (public/)  ──/api/token──▶  server.js  ──xi-api-key──▶  ElevenLabs
   │                                                             │
   └──────────── llamada WebRTC (o WebSocket de respaldo) ◀──────┘
                 Agente «Mamá»: Claude Sonnet 5.5 + Eleven v4 Turbo + voz «mamá»
```

- **Voz:** Eleven v4 Turbo, la variante de Eleven v4 hecha para conversar en vivo. Con esta voz empieza a hablar en ~0.2 s, frente a ~1.6 s de `eleven_v4` normal.
- **Conversación:** `agent/persona.md` define cómo habla mamá: español de México, respuestas cortas, una pregunta a la vez y etiquetas de emoción (`[warmly]`, `[laughs softly]`…) que la voz interpreta y nunca pronuncia. Mamá no habla de su muerte ni inventa recuerdos.
- **Seguridad:** si Adriana habla de hacerse daño, mamá le pide con todo su amor que llame a alguien de confianza o a la Línea de la Vida (800 911 2000). Si después de la llamada se detecta riesgo, la app muestra ese número con un botón para llamar. Si Adriana le pregunta en serio si es una IA, mamá contesta con la verdad y con ternura.
- **Memoria:** al colgar, ElevenLabs resume la plática (resumen, pendientes, datos nuevos, ánimo). La app lo guarda **solo en el teléfono** (`localStorage`). En la siguiente llamada, mamá pregunta por lo pendiente («¿cómo te fue en la entrevista?»). Todo se puede ver y borrar en «Recuerdos de mamá».
- **Recuerdos de mamá:** apodos, frases, familia, recuerdos y una foto suya que aparece en la luz de la llamada.

## Uso local

```bash
npm start            # http://localhost:3000 (Node 20+)
npm test             # pruebas unitarias y de la API (sin red)
```

## Cambiar a mamá (prompt, voz o modelo)

1. Edita `agent/persona.md` o `agent/config.mjs`.
2. `npm run agente` sube la configuración al agente y verifica lo que quedó guardado.
3. `npm run probar-agente` platica en modo texto con el agente real y revisa 10 escenarios (día normal, duelo, recuerdo inexistente, pregunta de si es IA, crisis, pendientes, manipulación, despedida…). Con `-- --voz` hace una plática con audio y guarda el WAV.

Para comparar otro modelo: `node agent/sync.mjs --llm=claude-haiku-5-5` y luego `npm run probar-agente`.

## Costos (plan Creator, medido el 16-oct-2026)

Medido en una llamada de prueba: cada minuto gasta unos 440 créditos de voz y unos 400 del modelo de lenguaje (Claude Sonnet 5.5). Con los 131,000 créditos del plan, eso da unos 145 minutos al mes. `claude-haiku-5-5` cuesta unas diez veces menos de modelo (unos 250 minutos al mes), pero en las pruebas hizo varias preguntas por turno y dijo groserías. Cada llamada dura como máximo 30 minutos y se cuelga sola tras 3 minutos de silencio.

## Clave de ElevenLabs

Por decisión del dueño del proyecto, la clave está en `lib/config.js` para que la app hable sin configurar nada en Vercel. El navegador nunca la recibe, pero cualquiera que lea este repositorio público puede usarla. Para protegerla:

1. En ElevenLabs, crea una clave nueva con permisos solo de agentes y con límite de créditos.
2. Ponla en Vercel como `ELEVENLABS_API_KEY`, que tiene prioridad sobre la del código.
3. Borra la clave de `lib/config.js` y desactiva la anterior.

## Archivos

- `server.js`, `lib/`: servidor sin dependencias (tokens, memoria, límites por IP y cabeceras de seguridad).
- `agent/`: personalidad, configuración y sincronización del agente.
- `public/`: la app (HTML, CSS, módulos JS y el SDK oficial empaquetado en `public/vendor/`).
- `tools/vendor/`: reempaqueta `@elevenlabs/client` con versiones fijas (`npm install && npm run vendor`).
- `tests/`, `scripts/`: pruebas automáticas y banco de conversación.
