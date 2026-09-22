import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  canAccessSupplierDirectory,
  canAssignRequestSupplier,
  canReadOrder,
  isRequester,
  safeCatalogItem,
  safeRequestOrder,
  validateRequesterSubmission,
  validateVisibleStatusUpdate,
} = require('../server/requesterOrders.js');

const requester = (overrides = {}) => ({ id: 7, role: 'REQUESTER', canUseCatalogItem: true, canUseFreeItem: true, ...overrides });
const catalogBody = (overrides = {}) => ({ fechaEntregaEsperada: '2026-09-30', lugarEntrega: 'Planta', observaciones: '', items: [{ tipo: 'CATALOGO', productoId: 10, cantidad: 2, unidad: 'kg' }], ...overrides });
const order = (overrides = {}) => ({
  id: 4, requestedById: 7, proveedorId: 2, numeroOrden: 'OC-2026-000004',
  fechaEmision: new Date('2026-09-22T12:00:00Z'), fechaEntregaEsperada: new Date('2026-09-30T12:00:00Z'),
  estado: 'ENVIADA', requesterVisibleStatus: 'ORDERED_FROM_SUPPLIER', subtotal: 100, impuestos: 21,
  porcentajeImpuestos: 21, descuentos: 0, total: 121, moneda: 'ARS', condicionesPago: '30 días',
  observaciones: 'Urgente', lugarEntrega: 'Planta', updatedAt: new Date('2026-09-22T14:00:00Z'),
  proveedor: { id: 2, nombre: 'Proveedor', taxId: '30', condicionPago: '30 días' },
  items: [{ id: 1, cantidad: 2, precioUnitario: 50, subtotalLinea: 100, unidadSolicitada: 'kg', codigoProveedor: 'A', nombreProveedor: 'Material A', producto: { codigo: 'A', descripcion: 'Material A', unidadMedida: 'kg', precioUnitario: 50, costoEstandar: 40, iva: 21 } }],
  requestStatusHistory: [
    { id: 1, status: 'RECEIVED_REQUEST', message: 'Solicitud enviada.', createdAt: new Date('2026-09-22T12:00:00Z'), changedBy: { id: 7, nombre: 'Solicitante' } },
    { id: 2, status: 'ORDERED_FROM_SUPPLIER', message: 'Entrega estimada jueves.', createdAt: new Date('2026-09-22T14:00:00Z'), changedBy: { id: 1, nombre: 'Admin' } },
  ],
  ...overrides,
});

const serializedRequest = () => JSON.stringify(safeRequestOrder(order()));

test('1. REQUESTER crea una solicitud sin proveedor', () => assert.equal('proveedorId' in validateRequesterSubmission(requester(), catalogBody()), false));
test('2. REQUESTER no puede consultar el directorio de proveedores', () => assert.equal(canAccessSupplierDirectory(requester()), false));
test('3. REQUESTER que envía proveedorId manualmente es rechazado', () => assert.throws(() => validateRequesterSubmission(requester(), catalogBody({ proveedorId: 2 })), /no permitidos/i));
test('4. REQUESTER que envía datos de proveedor manualmente es rechazado', () => assert.throws(() => validateRequesterSubmission(requester(), catalogBody({ proveedorRazonSocial: 'Oculto' })), /no permitidos/i));
test('5. REQUESTER no recibe precioUnitario', () => assert.equal(serializedRequest().includes('precioUnitario'), false));
test('6. REQUESTER no recibe subtotalLinea', () => assert.equal(serializedRequest().includes('subtotalLinea'), false));
test('7. REQUESTER no recibe subtotal', () => assert.equal(serializedRequest().toLowerCase().includes('subtotal'), false));
test('8. REQUESTER no recibe impuestos', () => assert.equal(serializedRequest().toLowerCase().includes('impuesto'), false));
test('9. REQUESTER no recibe descuentos', () => assert.equal(serializedRequest().toLowerCase().includes('descuento'), false));
test('10. REQUESTER no recibe total', () => assert.equal(serializedRequest().toLowerCase().includes('total'), false));
test('11. REQUESTER no recibe costoEstandar', () => assert.equal(serializedRequest().includes('costoEstandar'), false));
test('12. REQUESTER no recibe precioSinIva ni precioConIva', () => { const value = serializedRequest(); assert.equal(value.includes('precioSinIva'), false); assert.equal(value.includes('precioConIva'), false); });
test('13. REQUESTER no recibe proveedor aunque ya haya sido asignado internamente', () => { const value = safeRequestOrder(order()); assert.equal('proveedor' in value, false); assert.equal('proveedorId' in value, false); });
test('13b. REQUESTER recibe el código y descripción internos, no la equivalencia del proveedor', () => { const value = safeRequestOrder(order({ items: [{ ...order().items[0], codigoProveedor: 'COD-PROV', nombreProveedor: 'Nombre del proveedor', producto: { ...order().items[0].producto, codigo: 'INT-001', descripcion: 'Descripción interna' } }] })); assert.equal(value.items[0].codigo, 'INT-001'); assert.equal(value.items[0].descripcion, 'Descripción interna'); });
test('14. REQUESTER solo puede consultar solicitudes propias', () => assert.equal(canReadOrder(requester(), order()), true));
test('15. REQUESTER no puede consultar una solicitud ajena', () => assert.equal(canReadOrder(requester(), order({ requestedById: 99 })), false));
test('16. SYSTEM_ADMIN conserva proveedor y precios', () => { const raw = order(); assert.equal(isRequester({ role: 'SYSTEM_ADMIN' }), false); assert.equal(raw.proveedor.nombre, 'Proveedor'); assert.equal(raw.total, 121); assert.equal(raw.items[0].precioUnitario, 50); });
test('17. BUYER conserva proveedor y precios', () => { const raw = order(); assert.equal(isRequester({ role: 'BUYER' }), false); assert.equal(raw.proveedorId, 2); assert.equal(raw.subtotal, 100); });
test('18. SYSTEM_ADMIN y BUYER pueden asignar proveedor posteriormente', () => { assert.equal(canAssignRequestSupplier({ role: 'SYSTEM_ADMIN' }), true); assert.equal(canAssignRequestSupplier({ role: 'BUYER' }), true); assert.equal(canAssignRequestSupplier(requester()), false); });
test('19. REQUESTER ve estado, mensaje e historial', () => { const safe = safeRequestOrder(order()); assert.equal(safe.requesterVisibleStatus, 'ORDERED_FROM_SUPPLIER'); assert.equal(safe.lastMessage, 'Entrega estimada jueves.'); assert.deepEqual(safe.history.map((entry) => entry.status), ['RECEIVED_REQUEST', 'ORDERED_FROM_SUPPLIER']); });
test('20. REQUESTER no puede modificar estado ni mensaje', () => assert.throws(() => validateVisibleStatusUpdate(requester(), { status: 'DELIVERED', message: 'Intento' }), (error) => error.statusCode === 403));
test('21. los permisos de catálogo e ítem libre se aplican en backend', () => { assert.throws(() => validateRequesterSubmission(requester({ canUseCatalogItem: false }), catalogBody()), /catálogo/); assert.throws(() => validateRequesterSubmission(requester({ canUseFreeItem: false }), catalogBody({ items: [{ tipo: 'LIBRE', descripcionLibre: 'X', cantidad: 1, unidad: 'u.' }] })), /ítems libres/); });
test('22. parámetros económicos manipulados son rechazados', () => { assert.throws(() => validateRequesterSubmission(requester(), { ...catalogBody(), total: 1 }), /no permitidos/); assert.throws(() => validateRequesterSubmission(requester(), catalogBody({ items: [{ ...catalogBody().items[0], precioUnitario: 1 }] })), /no permitidos/); });
test('23. el catálogo de REQUESTER elimina precios, costos, IVA y ofertas', () => { const safe = safeCatalogItem({ id: 1, codigo: 'A', descripcion: 'A', precioUnitario: 50, costoEstandar: 40, iva: 21, ofertas: [{ precioSinIva: 50, precioConIva: 60 }] }); const value = JSON.stringify(safe).toLowerCase(); assert.equal(value.includes('precio'), false); assert.equal(value.includes('costo'), false); assert.equal(value.includes('iva'), false); assert.deepEqual(safe.ofertas, []); });
