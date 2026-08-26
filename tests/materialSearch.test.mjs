import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMaterials } from '../src/utils/materialSearch.mjs';

const materials = [
  { id: 1, codigo: 'BI-00-005-005-0009', descripcion: 'Bisagra cierre suave', marca: 'Háfele', categoria: 'Herrajes', familia: 'Muebles', subfamilia: 'Cocina', ubicacion: 'Depósito A', codigoQr: 'QR-001', ofertas: [{ codigoProveedor: '311.90.500', nombreProveedor: 'Bisagra de cazoleta', marcaProveedor: 'QBO', proveedor: { nombre: 'Distribuidora Norte' } }] },
  { id: 2, codigo: 'TA-18-260-002-0000', descripcion: 'Tablero melamínico blanco', marca: 'Egger', categoria: 'Tableros', ofertas: [] },
  { id: 3, codigo: 'MAT-003', descripcion: 'Tornillo', marca: null, categoria: null },
];
const ids = (query) => filterMaterials(materials, query).map((item) => item.id);

test('empty and whitespace-only queries show all materials in original order', () => {
  for (const query of ['', '   \t\n', null]) assert.strictEqual(filterMaterials(materials, query), materials);
});
test('matches full and partial internal codes', () => {
  assert.deepEqual(ids('bi-00-005-005-0009'), [1]);
  assert.deepEqual(ids('260-002'), [2]);
});
test('ignores accents and case in both query and material data', () => {
  assert.deepEqual(ids('MELAMINICO'), [2]);
  assert.deepEqual(ids('TÓRNILLO'), [3]);
  assert.deepEqual(ids('hafele'), [1]);
});
test('finds category, family, subfamily, location and QR', () => {
  for (const query of ['herrajes', 'muebles', 'cocina', 'deposito', 'qr-001']) assert.deepEqual(ids(query), [1]);
});
test('finds supplier names, codes and equivalences', () => {
  for (const query of ['311.90.500', 'cazoleta', 'qbo', 'distribuidora norte']) assert.deepEqual(ids(query), [1]);
});
test('matches multiple words across fields regardless of order and extra spaces', () => {
  assert.deepEqual(ids('  HAFELE  bisagra suave  '), [1]);
  assert.deepEqual(ids('blanco egger tablero'), [2]);
  assert.deepEqual(ids('bisagra egger'), []);
});
test('treats special characters literally and returns no results for unknown text', () => {
  for (const query of ['[', '.*', 'inexistente']) assert.deepEqual(ids(query), []);
});
test('handles empty catalogs and missing optional supplier data', () => {
  assert.deepEqual(filterMaterials([], 'algo'), []);
  assert.equal(filterMaterials([{ codigo: 'X', ofertas: [null, {}] }], 'x').length, 1);
  assert.equal(filterMaterials([{ codigo: 'X', ofertas: null }], 'undefined').length, 0);
});
test('does not mutate materials or change the identity used by edit/delete', () => {
  const before = JSON.stringify(materials);
  assert.strictEqual(filterMaterials(materials, 'egger')[0], materials[1]);
  assert.equal(JSON.stringify(materials), before);
});
