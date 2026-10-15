import { Conversation } from 'https://esm.sh/@elevenlabs/client';

const btn = document.getElementById('liveBtn');
const statusEl = document.getElementById('status');
const setStatus = (t) => (statusEl.textContent = t);

let conversation = null;
let busy = false;

async function start() {
  busy = true;
  setStatus('Conectando…');
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    busy = false;
    return setStatus('Necesito permiso para usar el micrófono.');
  }
  try {
    const r = await fetch('/api/signed-url');
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo conectar');

    conversation = await Conversation.startSession({
      signedUrl: data.signedUrl,
      onModeChange: ({ mode }) => {
        btn.classList.toggle('talking', mode === 'speaking');
        setStatus(mode === 'speaking' ? 'Mamá está hablando…' : 'Te escucho…');
      },
      onDisconnect: () => reset(),
      onError: (e) => setStatus('Error: ' + (e?.message || e)),
    });
    btn.classList.add('on');
  } catch (e) {
    setStatus('Error: ' + e.message);
    conversation = null;
  }
  busy = false;
}

function reset() {
  conversation = null;
  btn.classList.remove('on', 'talking');
  setStatus('Pulsa para hablar con mamá');
}

async function stop() {
  const c = conversation;
  reset();
  try { await c?.endSession(); } catch {}
}

btn.addEventListener('click', () => {
  if (busy) return;
  conversation ? stop() : start();
});
