const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MEDIA_PREFIX = '__MATERIAL_MEDIA_V1__';

function materialPhoto(value) {
  // Omitted photos must survive spreadsheet imports and older clients.
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 40) {
    throw new Error('La foto debe ser una imagen de hasta 3 MB.');
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('La foto debe tener formato JPG, PNG o WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== match[2]) {
    throw new Error('La foto no es válida o supera los 3 MB.');
  }
  const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('El contenido del archivo no corresponde a una imagen JPG, PNG o WebP.');
  return value;
}

function packMaterialMedia(documentacionUrl, foto) {
  const url = typeof documentacionUrl === 'string' && documentacionUrl.trim() ? documentacionUrl.trim() : null;
  if (!foto) return url;
  return MEDIA_PREFIX + JSON.stringify({ documentacionUrl: url, foto });
}

function unpackMaterialMedia(value) {
  if (typeof value !== 'string' || !value.startsWith(MEDIA_PREFIX)) return { documentacionUrl: value || null, foto: null };
  try {
    const media = JSON.parse(value.slice(MEDIA_PREFIX.length));
    return { documentacionUrl: media.documentacionUrl || null, foto: materialPhoto(media.foto) };
  } catch {
    return { documentacionUrl: null, foto: null };
  }
}

module.exports = { materialPhoto, packMaterialMedia, unpackMaterialMedia };
