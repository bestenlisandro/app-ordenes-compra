const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// All words must match, but they can occur in different material fields.
export function filterMaterials(materials, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return materials;

  return materials.filter((material) => {
    const offers = Array.isArray(material.ofertas) ? material.ofertas : [];
    const text = normalize([
      material.codigo, material.descripcion, material.marca, material.categoria,
      material.familia, material.subfamilia, material.ubicacion, material.codigoQr,
      ...offers.flatMap((offer) => [
        offer?.codigoProveedor, offer?.nombreProveedor,
        offer?.marcaProveedor, offer?.proveedor?.nombre,
      ]),
    ].filter((value) => value != null).join(' '));
    return terms.every((term) => text.includes(term));
  });
}
