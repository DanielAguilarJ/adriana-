// Configuración completa del agente de ElevenLabs. Es una función pura para poder
// probarla; agent/sync.mjs la envía a la API.

export const VOZ_MAMA = 'HadWnZFcIBd4EUQHkvuf'; // voz clonada «mamá»
// Eleven v4 Turbo es la variante de Eleven v4 hecha para conversar en vivo:
// medido con esta voz, empieza a hablar en ~0.2 s frente a ~1.6 s de eleven_v4.
export const MODELO_VOZ = 'eleven_v4_turbo';
// Elegido con scripts/probar-agente.mjs (16-oct-2026): claude-sonnet-5-5 pasó 10/10
// escenarios con ~1-1.6 s por respuesta; claude-haiku-5-5 6/10 (varias preguntas por
// turno, groserías) y gemini-3.8-flash 8/10 con picos de 5 s.
export const LLM_POR_DEFECTO = 'claude-sonnet-5-5';

const VALORES_POR_DEFECTO = Object.freeze({
  nombre_hija: 'Adriana',
  apodos: 'mi amor, mi niña, mija',
  recuerdos: 'Todavía no tienes notas guardadas sobre ella; deja que ella te cuente y escúchala con cariño.',
  ultimas_platicas: 'No hay notas de pláticas anteriores.',
  momento: 'Hoy',
  saludo: '[warmly] ¿Bueno? ¡Hola, mi amor! ¿Cómo estás?',
});

const DESPEDIDA_POR_TIEMPO = '[tenderly] Ay, mi amor, ya me tengo que ir, pero háblame cuando quieras. Te quiero muchísimo.';
const DESPEDIDA_POR_SILENCIO = '[softly] Te dejo descansar, mi amor. Aquí estoy cuando me necesites. Te quiero.';

const herramienta = (nombre, descripcion, extra = {}) => ({
  name: nombre,
  description: descripcion,
  params: { system_tool_type: nombre, ...extra },
});

const MEMORIA_AL_COLGAR = {
  resumen: {
    type: 'string',
    description: 'En español y en dos a cuatro frases, en tercera persona, lo que la hija le contó a su mamá en esta llamada: cómo se sentía, qué le pasó, qué le preocupa o le alegra. Escríbelo como nota para que su mamá lo recuerde la próxima vez. Si casi no hablaron, escribe "Plática breve".',
  },
  pendientes: {
    type: 'string',
    description: 'En español: eventos o planes próximos que la hija mencionó y por los que su mamá podría preguntarle después (exámenes, citas médicas, entrevistas, viajes, cumpleaños), con el día o la fecha si lo dijo. Si no hay, responde "ninguno".',
  },
  datos_nuevos: {
    type: 'string',
    description: 'En español: datos duraderos y concretos que la hija dijo sobre ella misma, su familia, su mamá o sus recuerdos juntas (nombres de personas y su parentesco, gustos, apodos, lugares, anécdotas). Solo lo que ella dijo, sin suponer. Sepáralos con punto y coma. Si no hay, responde "ninguno".',
  },
  animo: {
    type: 'string',
    description: 'Una o dos palabras en español sobre cómo se sentía la hija al final de la llamada (por ejemplo: tranquila, contenta, triste, preocupada, cansada).',
  },
  riesgo: {
    type: 'boolean',
    description: 'true solo si la hija expresó ideas de hacerse daño, de no querer vivir o de querer morir; si no, false.',
  },
};

/** Variables {{así}} que aparecen en un texto. */
export function variablesUsadas(texto) {
  return [...new Set([...String(texto).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

function anulaciones() {
  // Desde el navegador solo se permite el modo de solo texto; la personalidad, la voz
  // y el modelo no se pueden cambiar desde fuera.
  return {
    conversation_config_override: {
      asr: { keywords: false },
      turn: { soft_timeout_config: { message: false, additional_soft_timeout_messages: false } },
      tts: { model_id: false, voice_id: false, supported_voices: false, stability: false, speed: false, similarity_boost: false, pronunciation_dictionary_locators: false },
      conversation: { text_only: true, max_duration_seconds: false },
      agent: {
        first_message: false,
        language: false,
        max_conversation_duration_message: false,
        silence_end_call_message: false,
        prompt: { prompt: false, llm: false, tool_ids: false, tool_ids_strict: false, native_mcp_server_ids: false, knowledge_base: false },
      },
    },
    custom_llm_extra_body: false,
    enable_conversation_initiation_client_data_from_webhook: false,
  };
}

/**
 * @param {{persona: string, llm?: string, razonamiento?: string|null, nombre?: string}} opciones
 */
export function construirAgente({ persona, llm = LLM_POR_DEFECTO, razonamiento = 'low', nombre = 'Mamá' }) {
  return {
    name: nombre,
    tags: ['voz-mama'],
    conversation_config: {
      asr: { quality: 'high', provider: 'scribe_realtime', user_input_audio_format: 'pcm_16000', keywords: ['mamá', 'mami', 'Adriana', 'Adri', 'mija'] },
      turn: {
        turn_timeout: 10,
        silence_end_call_timeout: 180,
        turn_eagerness: 'patient',
        speculative_turn: true,
        turn_model: 'turn_v3',
      },
      tts: {
        model_id: MODELO_VOZ,
        voice_id: VOZ_MAMA,
        stability: 0.45,
        similarity_boost: 0.9,
        agent_output_audio_format: 'pcm_44100',
      },
      conversation: {
        max_duration_seconds: 1800,
        client_events: ['audio', 'interruption', 'agent_response', 'user_transcript', 'agent_response_correction', 'agent_tool_response'],
      },
      agent: {
        language: 'es',
        first_message: '{{saludo}}',
        disable_first_message_interruptions: false,
        max_conversation_duration_message: DESPEDIDA_POR_TIEMPO,
        silence_end_call_message: DESPEDIDA_POR_SILENCIO,
        dynamic_variables: { dynamic_variable_placeholders: { ...VALORES_POR_DEFECTO } },
        prompt: {
          prompt: persona,
          llm,
          ...(razonamiento ? { reasoning_effort: razonamiento } : {}),
          temperature: 0.7,
          timezone: 'America/Mexico_City',
          ignore_default_personality: true,
          built_in_tools: {
            end_call: herramienta('end_call', 'Termina la llamada. Úsala solo cuando tu hija ya se despidió claramente (por ejemplo "ya me voy", "bye", "hasta mañana") y tú ya le dijiste adiós con cariño. Nunca la uses si ella está triste o llorando y no se ha despedido.'),
            skip_turn: herramienta('skip_turn', 'Quédate callada y espera cuando tu hija te pida un momento ("espérame", "dame un segundo") o necesite silencio.', { wait_timeout_secs: 30 }),
          },
        },
      },
    },
    platform_settings: {
      auth: { enable_auth: true, allowlist: [], require_origin_header: false },
      overrides: anulaciones(),
      // Topes contra abuso del endpoint público, holgados para el uso real de Adriana.
      call_limits: { agent_concurrency_limit: 3, daily_limit: 200, bursting_enabled: false },
      privacy: { record_voice: false, retention_days: -1, delete_transcript_and_pii: false, delete_audio: false, apply_to_existing_conversations: false, zero_retention_mode: false },
      data_collection: MEMORIA_AL_COLGAR,
      summary_language: 'es',
      analysis_llm: 'gemini-3.8-flash',
    },
  };
}
