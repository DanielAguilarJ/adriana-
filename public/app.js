const btn = document.getElementById('liveBtn');
const statusEl = document.getElementById('status');
const setStatus = (t) => (statusEl.textContent = t);

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, liveOn = false, speaking = false;

async function speak(text) {
  const r = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error('No se pudo generar la voz');
  const audio = new Audio(URL.createObjectURL(await r.blob()));
  speaking = true;
  btn.classList.add('talking');
  await new Promise((resolve) => {
    audio.onended = audio.onerror = resolve;
    audio.play().catch(resolve);
  });
  btn.classList.remove('talking');
  speaking = false;
}

function start() {
  if (!SR) return setStatus('Usa Chrome, Edge o Safari para hablar.');
  recog = new SR();
  recog.lang = 'es-ES';
  recog.continuous = true;
  recog.interimResults = false;
  recog.onresult = async (ev) => {
    const res = ev.results[ev.results.length - 1];
    if (!res.isFinal || speaking) return;
    const text = res[0].transcript.trim();
    if (!text) return;
    recog.stop(); // evita captar la voz reproducida
    try { await speak(text); } catch (e) { setStatus(e.message); }
  };
  recog.onend = () => {
    if (liveOn && !speaking) { try { recog.start(); setStatus('Escuchando…'); } catch {} }
  };
  recog.onerror = (e) => {
    if (e.error === 'not-allowed') { setStatus('Permiso de micrófono denegado.'); stop(); }
  };
  liveOn = true;
  recog.start();
  btn.classList.add('on');
  setStatus('Escuchando…');
}

function stop() {
  liveOn = false;
  try { recog?.stop(); } catch {}
  btn.classList.remove('on');
  setStatus('Pulsa y habla');
}

btn.addEventListener('click', () => (liveOn ? stop() : start()));
