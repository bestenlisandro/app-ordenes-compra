// A purchase order may only select materials explicitly linked to its supplier.
// Keep only that supplier's offers so another supplier's codes cannot match.
export function materialsForSupplier(materials, supplierId) {
  const id = Number(supplierId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  return materials.flatMap((material) => {
    const offers = Array.isArray(material.ofertas)
      ? material.ofertas.filter((offer) => Number(offer?.proveedorId) === id)
      : [];
    return offers.length ? [{ ...material, ofertas: offers }] : [];
  });
}
