import test from 'node:test';
import assert from 'node:assert/strict';
import { materialsForSupplier } from '../src/utils/supplierMaterials.mjs';
import { filterMaterials } from '../src/utils/materialSearch.mjs';

const catalog = [
  { id: 1, codigo: 'BI-001', descripcion: 'Bisagra suave', marca: 'Háfele', ofertas: [
    { proveedorId: 1, codigoProveedor: 'NORTE-10', precioSinIva: 500, proveedor: { nombre: 'Norte' } },
    { proveedorId: 2, codigoProveedor: 'SUR-20', precioSinIva: 700, proveedor: { nombre: 'Sur' } },
  ] },
  { id: 2, codigo: 'TA-002', ofertas: [{ proveedorId: 2 }] },
  { id: 3, codigo: 'SIN-OFERTAS', ofertas: [] },
  { id: 4, codigo: 'SIN-ASOCIACION' },
  { id: 5, codigo: 'SIN-DATOS', ofertas: [null, {}] },
];

test('requires a selected supplier and returns nothing for invalid IDs', () => {
  for (const id of ['', 0, null, undefined, -1, 'abc', 1.5]) {
    assert.deepEqual(materialsForSupplier(catalog, id), []);
  }
});
test('only includes explicit supplier associations, including shared materials', () => {
  assert.deepEqual(materialsForSupplier(catalog, 1).map(x => x.id), [1]);
  assert.deepEqual(materialsForSupplier(catalog, '2').map(x => x.id), [1, 2]);
  assert.deepEqual(materialsForSupplier(catalog, 999), []);
});
test('searches internal fields and only the selected supplier equivalences', () => {
  const eligible = materialsForSupplier(catalog, 1);
  assert.equal(filterMaterials(eligible, 'HAFELE suave norte-10').length, 1);
  assert.equal(filterMaterials(eligible, 'sur-20').length, 0);
  assert.equal(eligible[0].ofertas[0].precioSinIva, 500);
});
test('does not mutate catalog or supplier offers', () => {
  const before = JSON.stringify(catalog);
  materialsForSupplier(catalog, 1);
  assert.equal(JSON.stringify(catalog), before);
  assert.equal(catalog[0].ofertas.length, 2);
});
test('does not limit the number of associated materials', () => {
  const many = Array.from({ length: 600 }, (_, id) => ({ id, ofertas: [{ proveedorId: '1' }] }));
  assert.equal(materialsForSupplier(many, 1).length, 600);
});
