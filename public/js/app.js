// Controlador de la app: inicio → llamando → en llamada → fin.
import { conectar, pedirMicrofono, ErrorLlamada } from './llamada.js';
import { crearAlmacen, construirVariables, agregarPlatica, normalizarPerfil, ultimaPlaticaConRiesgo } from './memoria.js';
import { esperarMemoria, recuperarPendientes } from './memoria-remota.js';
import { elegirSaludo, franjaDelDia } from './saludos.js';
import { limpiarEtiquetas, formatearDuracion, describirHace, mensajeDeCorte } from './texto.js';
import { crearRecuerdos } from './recuerdos.js';
import { crearTono } from './tono.js';
import { crearVisual } from './visual.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const almacen = crearAlmacen();
const tono = crearTono();
const visual = crearVisual(app);
const SALUDO_HORA = { madrugada: 'Buenas noches', mañana: 'Buenos días', tarde: 'Buenas tardes', noche: 'Buenas noches' };
const DURACION_MINIMA_PARA_MEMORIA = 8;

let llamada = null; // { conversacion, id, inicio, reloj, terminada }

function estado(nombre) {
  app.dataset.estado = nombre;
}

function decir(texto) {
  $('estado').textContent = texto;
}

function pintarInicio() {
  const perfil = normalizarPerfil(almacen.leer('perfil', {}));
  const platicas = almacen.leer('platicas', []);
  $('saludo-hora').textContent = `${SALUDO_HORA[franjaDelDia(new Date().getHours())]}, ${perfil.nombreHija}`;
  const ultima = platicas[0];
  $('ultima-platica').hidden = !ultima;
  if (ultima) $('ultima-platica').textContent = `Última plática: ${describirHace(ultima.fecha)}`;
  $('invitacion').hidden = Boolean(almacen.leer('perfil', null));
  const foto = almacen.leer('foto', null);
  $('foto').hidden = !foto;
  if (foto) $('foto').src = foto;
  else $('foto').removeAttribute('src');
  $('apoyo').hidden = !ultimaPlaticaConRiesgo(platicas);
  if (app.dataset.estado === 'inicio') decir('');
}

function prepararVariables() {
  const perfil = almacen.leer('perfil', {});
  const platicas = almacen.leer('platicas', []);
  const ahora = new Date();
  const saludo = elegirSaludo({ fecha: ahora, apodo: normalizarPerfil(perfil).apodos, ultimaPlatica: platicas[0]?.fecha });
  return construirVariables({ perfil, platicas, datos: almacen.leer('datos', []), fecha: ahora, saludo });
}

function limpiarLlamada() {
  $('dijo-hija').textContent = '';
  $('dijo-mama').textContent = '';
  $('cronometro').textContent = '';
  $('form-escribir').hidden = true;
  $('silenciar').setAttribute('aria-pressed', 'false');
  $('silenciar').setAttribute('aria-label', 'Apagar micrófono');
  delete app.dataset.modo;
  delete app.dataset.pensando;
}

function alConectar({ conversationId }) {
  tono.detener();
  if (!llamada || llamada.terminada) return;
  llamada.id = conversationId;
  llamada.inicio = Date.now();
  estado('en-llamada');
  decir('Mamá está contestando');
  llamada.reloj = setInterval(() => {
    $('cronometro').textContent = formatearDuracion((Date.now() - llamada.inicio) / 1000);
  }, 1000);
  if (conversationId) {
    almacen.guardar('platicas', agregarPlatica(almacen.leer('platicas', []), { id: conversationId, fecha: new Date().toISOString(), estado: 'pendiente' }));
  }
}

function alCambiarModo({ mode }) {
  app.dataset.modo = mode;
  if (mode === 'speaking') delete app.dataset.pensando;
  if ($('silenciar').getAttribute('aria-pressed') === 'true') return decir('Tu micrófono está apagado');
  decir(mode === 'speaking' ? 'Mamá está hablando' : 'Mamá te escucha');
}

function alMensaje({ message, role, source }) {
  const esMama = role === 'agent' || source === 'ai';
  const texto = esMama ? limpiarEtiquetas(message) : String(message || '').trim();
  if (!texto) return;
  if (esMama) {
    $('dijo-mama').textContent = texto;
    delete app.dataset.pensando;
  } else {
    $('dijo-hija').textContent = `Tú: ${texto}`;
    $('dijo-mama').textContent = '';
    app.dataset.pensando = 'si';
  }
}

async function guardarMemoria(id) {
  const aviso = $('estado-memoria');
  aviso.hidden = false;
  aviso.textContent = 'Guardando lo que le contaste…';
  const resultado = await esperarMemoria(almacen, id);
  aviso.textContent = resultado === 'lista' ? 'Mamá recordará lo que le contaste.' : '';
  aviso.hidden = resultado !== 'lista';
  $('apoyo').hidden = !ultimaPlaticaConRiesgo(almacen.leer('platicas', []));
}

function terminar(detalles) {
  tono.detener();
  visual.detener();
  if (!llamada || llamada.terminada) return;
  llamada.terminada = true;
  clearInterval(llamada.reloj);
  const segundos = llamada.inicio ? (Date.now() - llamada.inicio) / 1000 : 0;
  const id = llamada.id;
  const nuncaContesto = !llamada.inicio;
  llamada = null;
  limpiarLlamada();
  decir('');
  if (nuncaContesto && detalles?.reason === 'user') {
    estado('inicio');
    return pintarInicio();
  }
  estado('fin');
  const corte = mensajeDeCorte(detalles);
  $('mensaje-fin').textContent = corte || `Llamada terminada${segundos ? ` · ${formatearDuracion(segundos)}` : ''}`;
  $('estado-memoria').hidden = true;
  if (id && segundos >= DURACION_MINIMA_PARA_MEMORIA) guardarMemoria(id);
  $('volver-a-llamar').focus();
}

async function llamar() {
  if (llamada) return;
  llamada = { terminada: false };
  limpiarLlamada();
  estado('llamando');
  decir('Llamando…');
  $('apoyo').hidden = true;
  tono.sonar();
  try {
    await pedirMicrofono();
    const conversacion = await conectar({
      variables: prepararVariables(),
      callbacks: {
        onConnect: alConectar,
        onModeChange: alCambiarModo,
        onMessage: alMensaje,
        onDisconnect: terminar,
        onError: (mensaje) => console.error('Error en la llamada:', mensaje),
      },
    });
    if (!llamada || llamada.terminada) return conversacion.endSession();
    llamada.conversacion = conversacion;
    visual.seguir(conversacion);
    if (app.dataset.estado === 'llamando') alConectar({ conversationId: conversacion.getId() });
  } catch (e) {
    tono.detener();
    llamada = null;
    estado('inicio');
    pintarInicio();
    decir(e instanceof ErrorLlamada ? e.message : 'No pude conectar la llamada. Intenta de nuevo.');
  }
}

function colgar() {
  const conversacion = llamada?.conversacion;
  if (!conversacion) return terminar({ reason: 'user' });
  conversacion.endSession().catch(() => terminar({ reason: 'user' }));
}

function alternarMicrofono() {
  const conversacion = llamada?.conversacion;
  if (!conversacion) return;
  const apagado = $('silenciar').getAttribute('aria-pressed') !== 'true';
  conversacion.setMicMuted(apagado);
  $('silenciar').setAttribute('aria-pressed', String(apagado));
  $('silenciar').setAttribute('aria-label', apagado ? 'Encender micrófono' : 'Apagar micrófono');
  decir(apagado ? 'Tu micrófono está apagado' : 'Mamá te escucha');
}

function alternarEscribir() {
  const form = $('form-escribir');
  form.hidden = !form.hidden;
  if (!form.hidden) $('texto-escribir').focus();
}

function enviarTexto(e) {
  e.preventDefault();
  const campo = $('texto-escribir');
  const texto = campo.value.trim();
  const conversacion = llamada?.conversacion;
  if (!texto || !conversacion) return;
  conversacion.sendUserMessage(texto);
  alMensaje({ message: texto, role: 'user' });
  campo.value = '';
}

function alternarSubtitulos() {
  const visibles = app.dataset.subtitulos !== 'no';
  app.dataset.subtitulos = visibles ? 'no' : 'si';
  $('ver-subtitulos').setAttribute('aria-pressed', String(!visibles));
  almacen.guardar('subtitulos', !visibles);
}

function iniciar() {
  const recuerdos = crearRecuerdos({ almacen, alCambiar: pintarInicio });
  app.dataset.subtitulos = almacen.leer('subtitulos', true) ? 'si' : 'no';
  $('ver-subtitulos').setAttribute('aria-pressed', String(app.dataset.subtitulos === 'si'));
  $('llamar').addEventListener('click', llamar);
  $('volver-a-llamar').addEventListener('click', llamar);
  $('ir-inicio').addEventListener('click', () => { estado('inicio'); pintarInicio(); });
  $('colgar').addEventListener('click', colgar);
  $('silenciar').addEventListener('click', alternarMicrofono);
  $('escribir').addEventListener('click', alternarEscribir);
  $('ver-subtitulos').addEventListener('click', alternarSubtitulos);
  $('form-escribir').addEventListener('submit', enviarTexto);
  $('texto-escribir').addEventListener('input', () => llamada?.conversacion?.sendUserActivity());
  $('abrir-recuerdos').addEventListener('click', recuerdos.abrir);
  $('invitacion').addEventListener('click', recuerdos.abrir);
  pintarInicio();
  recuperarPendientes(almacen).then(pintarInicio).catch(() => {});
}

iniciar();
