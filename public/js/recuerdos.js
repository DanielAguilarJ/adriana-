// Hoja "Recuerdos de mamá": lo que Adriana quiere que mamá tenga presente y lo que
// mamá ha aprendido en las pláticas (que ella puede borrar).
import { normalizarPerfil } from './memoria.js';
import { describirHace } from './texto.js';
import { prepararFoto } from './foto.js';

const $ = (id) => document.getElementById(id);

function botonQuitar(etiqueta, alQuitar) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'quitar';
  b.textContent = '×';
  b.setAttribute('aria-label', etiqueta);
  b.addEventListener('click', alQuitar);
  return b;
}

function elemento(etiqueta, texto, clase) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  el.textContent = texto;
  return el;
}

export function crearRecuerdos({ almacen, alCambiar }) {
  const dialogo = $('recuerdos');
  const form = $('form-recuerdos');
  let fotoTemporal = null;

  function pintarFoto(dataUrl) {
    $('vista-foto').hidden = !dataUrl;
    $('quitar-foto').hidden = !dataUrl;
    if (dataUrl) $('vista-foto').src = dataUrl;
    else $('vista-foto').removeAttribute('src');
  }

  function pintarAprendido() {
    const datos = almacen.leer('datos', []);
    const platicas = almacen.leer('platicas', []).filter((p) => p.estado === 'lista' && p.resumen);
    const listaDatos = $('lista-datos');
    const listaPlaticas = $('lista-platicas');
    listaDatos.replaceChildren(...datos.slice().reverse().map((dato) => {
      const li = document.createElement('li');
      li.append(elemento('span', dato), botonQuitar('Olvidar este dato', () => {
        almacen.guardar('datos', almacen.leer('datos', []).filter((d) => d !== dato));
        pintarAprendido();
        alCambiar();
      }));
      return li;
    }));
    listaPlaticas.replaceChildren(...platicas.slice(0, 6).map((p) => {
      const li = document.createElement('li');
      const span = elemento('span', p.resumen);
      const cuando = describirHace(p.fecha);
      span.prepend(elemento('small', cuando.charAt(0).toUpperCase() + cuando.slice(1)));
      li.append(span, botonQuitar('Olvidar esta plática', () => {
        almacen.guardar('platicas', almacen.leer('platicas', []).filter((x) => x.id !== p.id));
        pintarAprendido();
        alCambiar();
      }));
      return li;
    }));
    const vacio = !datos.length && !platicas.length;
    $('sin-aprendido').hidden = !vacio;
    $('olvidar-todo').hidden = vacio;
  }

  function abrir() {
    // Se muestran los valores guardados tal cual; si no hay, se ve el texto de ejemplo.
    const guardado = almacen.leer('perfil', null) || {};
    for (const campo of Object.keys(normalizarPerfil({}))) {
      if (form.elements[campo]) form.elements[campo].value = guardado[campo] || '';
    }
    fotoTemporal = almacen.leer('foto', null);
    pintarFoto(fotoTemporal);
    pintarAprendido();
    // Cerrar con Escape no cambia returnValue: se limpia para no guardar por accidente.
    dialogo.returnValue = '';
    dialogo.showModal();
  }

  $('elegir-foto').addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      fotoTemporal = await prepararFoto(archivo);
      pintarFoto(fotoTemporal);
    } catch (err) {
      alert(err.message);
    }
  });

  $('quitar-foto').addEventListener('click', () => {
    fotoTemporal = null;
    pintarFoto(null);
  });

  $('olvidar-todo').addEventListener('click', () => {
    if (!confirm('¿Quieres que mamá olvide lo que ha aprendido en sus pláticas? Lo que escribiste arriba se queda.')) return;
    almacen.guardar('datos', []);
    almacen.guardar('platicas', []);
    pintarAprendido();
    alCambiar();
  });

  dialogo.addEventListener('close', () => {
    if (dialogo.returnValue !== 'guardar') return;
    const campos = Object.fromEntries(new FormData(form).entries());
    const perfil = normalizarPerfil(campos);
    almacen.guardar('perfil', perfil);
    const fotoGuardada = fotoTemporal ? almacen.guardar('foto', fotoTemporal) : (almacen.borrar('foto'), true);
    if (!fotoGuardada) alert('No hubo espacio para guardar la foto en este teléfono.');
    alCambiar();
  });

  return { abrir };
}
