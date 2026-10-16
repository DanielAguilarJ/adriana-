// Limitador de ventana fija en memoria. En Vercel cada instancia tiene el suyo,
// así que es una protección de mejor esfuerzo contra abuso, no una garantía.

export function crearLimitador({ max, ventanaMs, maxClaves = 5000, ahora = Date.now }) {
  const cubetas = new Map();

  function podar(t) {
    for (const [clave, c] of cubetas) {
      if (t - c.inicio >= ventanaMs) cubetas.delete(clave);
    }
    // Si aún hay demasiadas claves, se descartan las más antiguas (orden de inserción).
    while (cubetas.size > maxClaves) cubetas.delete(cubetas.keys().next().value);
  }

  return {
    permitir(clave) {
      const t = ahora();
      const c = cubetas.get(clave);
      if (!c || t - c.inicio >= ventanaMs) {
        cubetas.delete(clave);
        cubetas.set(clave, { inicio: t, cuenta: 1 });
        if (cubetas.size > maxClaves) podar(t);
        return true;
      }
      if (c.cuenta >= max) return false;
      cubetas.set(clave, { inicio: c.inicio, cuenta: c.cuenta + 1 });
      return true;
    },
    segundosParaReintentar(clave) {
      const c = cubetas.get(clave);
      if (!c) return 0;
      return Math.max(1, Math.ceil((c.inicio + ventanaMs - ahora()) / 1000));
    },
    tamano: () => cubetas.size,
  };
}
