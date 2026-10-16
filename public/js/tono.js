// Tono de "está sonando" mientras se conecta la llamada: 425 Hz, 1 s sonando y
// 4 s en silencio, como el timbre telefónico en México, a volumen bajo.
const FRECUENCIA = 425;
const VOLUMEN = 0.05;
const CICLO_MS = 5000;

export function crearTono() {
  let ctx = null;
  let ganancia = null;
  let oscilador = null;
  let intervalo = null;

  function timbrar() {
    if (!ctx) return;
    const t = ctx.currentTime;
    ganancia.gain.cancelScheduledValues(t);
    ganancia.gain.setTargetAtTime(VOLUMEN, t, 0.03);
    ganancia.gain.setTargetAtTime(0, t + 1, 0.05);
  }

  return {
    sonar() {
      try {
        const Contexto = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Contexto || ctx) return;
        ctx = new Contexto();
        ganancia = ctx.createGain();
        ganancia.gain.value = 0;
        ganancia.connect(ctx.destination);
        oscilador = ctx.createOscillator();
        oscilador.type = 'sine';
        oscilador.frequency.value = FRECUENCIA;
        oscilador.connect(ganancia);
        oscilador.start();
        timbrar();
        intervalo = setInterval(timbrar, CICLO_MS);
      } catch (e) {
        console.warn('Sin tono de llamada:', e);
      }
    },
    detener() {
      clearInterval(intervalo);
      intervalo = null;
      const actual = ctx;
      ctx = null;
      if (!actual) return;
      try {
        ganancia.gain.setTargetAtTime(0, actual.currentTime, 0.02);
        setTimeout(() => actual.close().catch(() => {}), 150);
      } catch {
        /* el contexto ya estaba cerrado */
      }
    },
  };
}
