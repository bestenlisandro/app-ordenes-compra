import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canReadOrder, isRequester, safeCatalogItem, safeRequestOrder, validateRequesterSubmission, validateVisibleStatusUpdate } = require('../server/requesterOrders.js');

const requester = (overrides = {}) => ({ id: 7, role: 'REQUESTER', canChooseSupplier: true, canUseCatalogItem: true, canUseFreeItem: true, ...overrides });
const catalogBody = (overrides = {}) => ({ proveedorId: '', fechaEntregaEsperada: '2026-09-30', lugarEntrega: 'Planta', observaciones: '', items: [{ tipo: 'CATALOGO', productoId: 10, cantidad: 2, unidad: 'kg' }], ...overrides });
const order = (overrides = {}) => ({
  id: 4, requestedById: 7, proveedorId: 2, numeroOrden: 'OC-2026-000004', fechaEmision: new Date('2026-09-22T12:00:00Z'), fechaEntregaEsperada: new Date('2026-09-30T12:00:00Z'), estado: 'ENVIADA', requesterVisibleStatus: 'ORDERED_FROM_SUPPLIER', subtotal: 100, impuestos: 21, descuentos: 0, total: 121, moneda: 'ARS', observaciones: 'Urgente', lugarEntrega: 'Planta', updatedAt: new Date('2026-09-22T14:00:00Z'), proveedor: { id: 2, nombre: 'Proveedor', taxId: '30', condicionPago: '30 días' }, items: [{ id: 1, cantidad: 2, precioUnitario: 50, subtotalLinea: 100, unidadSolicitada: 'kg', codigoProveedor: 'A', nombreProveedor: 'Material A', producto: { codigo: 'A', descripcion: 'Material A', unidadMedida: 'kg', precioUnitario: 50 } }], requestStatusHistory: [{ id: 1, status: 'RECEIVED_REQUEST', message: 'Solicitud enviada.', createdAt: new Date('2026-09-22T12:00:00Z'), changedBy: { id: 7, nombre: 'Solicitante' } }, { id: 2, status: 'ORDERED_FROM_SUPPLIER', message: 'Entrega estimada jueves.', createdAt: new Date('2026-09-22T14:00:00Z'), changedBy: { id: 1, nombre: 'Admin' } }], ...overrides,
});

test('1. REQUESTER sin permiso de proveedor no puede asignarlo', () => assert.throws(() => validateRequesterSubmission(requester({ canChooseSupplier: false }), catalogBody({ proveedorId: 2 })), /No tiene permiso/));
test('2. REQUESTER con permiso puede sugerir proveedor', () => assert.equal(validateRequesterSubmission(requester(), catalogBody({ proveedorId: 2 })).proveedorId, 2));
test('3. REQUESTER con permiso puede seleccionar catálogo', () => assert.equal(validateRequesterSubmission(requester(), catalogBody()).items[0].productoId, 10));
test('4. REQUESTER con permiso puede cargar ítem libre', () => { const result = validateRequesterSubmission(requester(), catalogBody({ items: [{ tipo: 'LIBRE', descripcionLibre: 'Servicio técnico', cantidad: 1, unidad: 'hora' }] })); assert.equal(result.items[0].descripcionLibre, 'Servicio técnico'); });
test('5. la respuesta REQUESTER no contiene precio unitario', () => assert.equal(JSON.stringify(safeRequestOrder(order())).includes('precioUnitario'), false));
test('6. la respuesta REQUESTER no contiene subtotal', () => assert.equal(JSON.stringify(safeRequestOrder(order())).toLowerCase().includes('subtotal'), false));
test('7. la respuesta REQUESTER no contiene total ni impuestos', () => { const value = JSON.stringify(safeRequestOrder(order())).toLowerCase(); assert.equal(value.includes('total'), false); assert.equal(value.includes('impuesto'), false); assert.equal(value.includes('descuento'), false); });
test('8. REQUESTER solo puede leer solicitudes propias', () => { assert.equal(canReadOrder(requester(), order()), true); assert.equal(canReadOrder(requester(), order({ requestedById: 99 })), false); });
test('9. SYSTEM_ADMIN conserva el acceso a la representación económica original', () => { const raw = order(); assert.equal(isRequester({ role: 'SYSTEM_ADMIN' }), false); assert.equal(raw.total, 121); assert.equal(raw.items[0].precioUnitario, 50); });
test('10. SYSTEM_ADMIN puede elegir un estado visible', () => assert.equal(validateVisibleStatusUpdate({ role: 'SYSTEM_ADMIN' }, { status: 'DELIVERED' }).status, 'DELIVERED'));
test('11. SYSTEM_ADMIN puede escribir un mensaje', () => assert.equal(validateVisibleStatusUpdate({ role: 'SYSTEM_ADMIN' }, { status: 'ORDERED_FROM_SUPPLIER', message: 'Pedido realizado.' }).message, 'Pedido realizado.'));
test('12. REQUESTER ve el estado visible actualizado', () => assert.equal(safeRequestOrder(order()).requesterVisibleStatus, 'ORDERED_FROM_SUPPLIER'));
test('13. REQUESTER ve el último mensaje', () => assert.equal(safeRequestOrder(order()).lastMessage, 'Entrega estimada jueves.'));
test('14. el historial conserva todos los estados anteriores', () => assert.deepEqual(safeRequestOrder(order()).history.map((entry) => entry.status), ['RECEIVED_REQUEST', 'ORDERED_FROM_SUPPLIER']));
test('15. REQUESTER no puede modificar estado o mensaje', () => assert.throws(() => validateVisibleStatusUpdate(requester(), { status: 'DELIVERED', message: 'Intento' }), (error) => error.statusCode === 403));
test('16. el catálogo del REQUESTER elimina todos los campos económicos', () => { const safe = safeCatalogItem({ id: 1, codigo: 'A', descripcion: 'A', precioUnitario: 50, costoEstandar: 40, iva: 21, ofertas: [{ precioSinIva: 50, precioConIva: 60 }] }); const value = JSON.stringify(safe); assert.equal(value.includes('precio'), false); assert.equal(value.includes('costo'), false); assert.equal(value.includes('iva'), false); });
test('17. los permisos de tipo de ítem se aplican en backend', () => { assert.throws(() => validateRequesterSubmission(requester({ canUseCatalogItem: false }), catalogBody()), /catálogo/); assert.throws(() => validateRequesterSubmission(requester({ canUseFreeItem: false }), catalogBody({ items: [{ tipo: 'LIBRE', descripcionLibre: 'X', cantidad: 1, unidad: 'u.' }] })), /ítems libres/); });
test('18. parámetros económicos manipulados son rechazados', () => { assert.throws(() => validateRequesterSubmission(requester(), { ...catalogBody(), total: 1 }), /no permitidos/); assert.throws(() => validateRequesterSubmission(requester(), catalogBody({ items: [{ ...catalogBody().items[0], precioUnitario: 1 }] })), /no permitidos/); });
