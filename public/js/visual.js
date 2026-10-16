// Lleva el volumen de las dos voces a variables CSS (--voz-mama, --voz-hija) con un
// suavizado para que la luz respire en vez de parpadear.
const SUAVIZADO = 0.22;

function curva(v) {
  // getOutputVolume va de 0 (-100 dB) a 1 (-30 dB); la voz normal cae a media escala.
  const x = Math.min(1, Math.max(0, Number(v) || 0));
  return Math.pow(x, 1.6);
}

export function crearVisual(elemento) {
  let fuente = null;
  let raf = 0;
  let mama = 0;
  let hija = 0;

  function pintar() {
    elemento.style.setProperty('--voz-mama', mama.toFixed(3));
    elemento.style.setProperty('--voz-hija', hija.toFixed(3));
  }

  function cuadro() {
    if (!fuente) return;
    try {
      mama += (curva(fuente.getOutputVolume()) - mama) * SUAVIZADO;
      hija += (curva(fuente.getInputVolume()) - hija) * SUAVIZADO;
    } catch {
      mama *= 0.9;
      hija *= 0.9;
    }
    pintar();
    raf = requestAnimationFrame(cuadro);
  }

  return {
    seguir(conversacion) {
      fuente = conversacion;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(cuadro);
    },
    detener() {
      fuente = null;
      cancelAnimationFrame(raf);
      mama = 0;
      hija = 0;
      pintar();
    },
  };
}
