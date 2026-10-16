// Reduce la foto elegida a un JPEG cuadrado y ligero para guardarla en el teléfono.
const LADO = 512;
const CALIDAD = 0.86;
const MAX_ARCHIVO = 25 * 1024 * 1024;

function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No pude abrir esa imagen.')); };
    img.src = url;
  });
}

/** Recorta al centro y devuelve un data URL JPEG de 512×512. */
export async function prepararFoto(archivo) {
  if (!archivo || !archivo.type?.startsWith('image/')) throw new Error('Elige una imagen, por favor.');
  if (archivo.size > MAX_ARCHIVO) throw new Error('La imagen es muy pesada. Prueba con otra.');
  const img = await cargarImagen(archivo);
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  const lienzo = document.createElement('canvas');
  lienzo.width = LADO;
  lienzo.height = LADO;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // Encuadre un poco hacia arriba: en los retratos la cara suele estar en el tercio superior.
  const x = (img.naturalWidth - lado) / 2;
  const y = Math.max(0, (img.naturalHeight - lado) * 0.35);
  ctx.drawImage(img, x, y, lado, lado, 0, 0, LADO, LADO);
  return lienzo.toDataURL('image/jpeg', CALIDAD);
}
