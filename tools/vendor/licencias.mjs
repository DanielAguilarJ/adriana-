// Junta las licencias de @elevenlabs/client y de todo lo que esbuild metió en el paquete.
import fs from 'node:fs';
import path from 'node:path';

const modulos = path.resolve('node_modules');
const salida = path.resolve('../../public/vendor/LICENSES.txt');
const ignorar = new Set(['esbuild', '@esbuild']);

function paquetes(dir) {
  const lista = [];
  for (const nombre of fs.readdirSync(dir)) {
    if (nombre.startsWith('.') || ignorar.has(nombre)) continue;
    const ruta = path.join(dir, nombre);
    if (nombre.startsWith('@')) lista.push(...paquetes(ruta));
    else if (fs.existsSync(path.join(ruta, 'package.json'))) lista.push(ruta);
  }
  return lista;
}

const bloques = paquetes(modulos).sort().map((ruta) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ruta, 'package.json'), 'utf8'));
  const archivo = fs.readdirSync(ruta).find((f) => /^(license|licence|copying)/i.test(f));
  const texto = archivo ? fs.readFileSync(path.join(ruta, archivo), 'utf8').trim() : `Licencia declarada: ${pkg.license}`;
  return `==== ${pkg.name}@${pkg.version} (${pkg.license}) ====\n${texto}\n`;
});

fs.writeFileSync(salida, `Paquetes incluidos en elevenlabs-client.js\n\n${bloques.join('\n')}`);
console.log(`${bloques.length} licencias en ${salida}`);
