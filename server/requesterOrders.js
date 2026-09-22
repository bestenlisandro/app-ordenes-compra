const REQUEST_VISIBLE_STATUSES = ['RECEIVED_REQUEST', 'ORDERED_FROM_SUPPLIER', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'];
const REQUEST_BODY_FIELDS = new Set(['proveedorId', 'fechaEntregaEsperada', 'lugarEntrega', 'observaciones', 'items']);
const REQUEST_ITEM_FIELDS = new Set(['tipo', 'productoId', 'codigoLibre', 'descripcionLibre', 'cantidad', 'unidad']);

const text = (value, max) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Uno de los textos de la solicitud no es válido.');
  const result = value.trim();
  if (result.length > max) throw new Error(`Uno de los textos supera el máximo de ${max} caracteres.`);
  return result || null;
};

function isRequester(user) {
  return user?.role === 'REQUESTER';
}

function canReadOrder(user, order) {
  if (isRequester(user)) return order?.requestedById === user.id;
  if (user?.role === 'VENDOR') return order?.proveedorId === user.supplierId;
  return true;
}

function requesterCapabilities(user) {
  return {
    canChooseSupplier: user?.canChooseSupplier !== false,
    canUseCatalogItem: user?.canUseCatalogItem !== false,
    canUseFreeItem: user?.canUseFreeItem !== false,
  };
}

function validateRequesterSubmission(user, body) {
  const capabilities = requesterCapabilities(user);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('La solicitud no es válida.');
  const unexpected = Object.keys(body).filter((key) => !REQUEST_BODY_FIELDS.has(key));
  if (unexpected.length) throw new Error(`Campos no permitidos en la solicitud: ${unexpected.join(', ')}.`);
  if (!Array.isArray(body.items) || !body.items.length) throw new Error('La solicitud debe tener al menos un ítem.');
  const proveedorId = body.proveedorId === '' || body.proveedorId == null ? null : Number(body.proveedorId);
  if (proveedorId != null && (!Number.isInteger(proveedorId) || proveedorId <= 0)) throw new Error('El proveedor sugerido no es válido.');
  if (proveedorId != null && !capabilities.canChooseSupplier) throw new Error('No tiene permiso para sugerir un proveedor.');
  const items = body.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Uno de los ítems no es válido.');
    const invalidFields = Object.keys(item).filter((key) => !REQUEST_ITEM_FIELDS.has(key));
    if (invalidFields.length) throw new Error(`Campos de ítem no permitidos: ${invalidFields.join(', ')}.`);
    if (!['CATALOGO', 'LIBRE'].includes(item.tipo)) throw new Error('El tipo de ítem no es válido.');
    if (item.tipo === 'CATALOGO' && !capabilities.canUseCatalogItem) throw new Error('No tiene permiso para solicitar materiales del catálogo.');
    if (item.tipo === 'LIBRE' && !capabilities.canUseFreeItem) throw new Error('No tiene permiso para cargar ítems libres.');
    const cantidad = Number(item.cantidad);
    if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
    const unidad = text(item.unidad, 50);
    if (!unidad) throw new Error('La unidad es obligatoria.');
    if (item.tipo === 'CATALOGO') {
      const productoId = Number(item.productoId);
      if (!Number.isInteger(productoId) || productoId <= 0) throw new Error('Debe seleccionar un material del catálogo.');
      return { tipo: 'CATALOGO', productoId, cantidad, unidad };
    }
    const descripcionLibre = text(item.descripcionLibre, 500);
    if (!descripcionLibre) throw new Error('Debe escribir la descripción del ítem libre.');
    return { tipo: 'LIBRE', codigoLibre: text(item.codigoLibre, 100), descripcionLibre, cantidad, unidad };
  });
  return {
    proveedorId,
    fechaEntregaEsperada: text(body.fechaEntregaEsperada, 20),
    lugarEntrega: text(body.lugarEntrega, 500),
    observaciones: text(body.observaciones, 2000),
    items,
  };
}

function safeSupplier(supplier) {
  return supplier ? { id: supplier.id, nombre: supplier.nombre } : null;
}

function safeCatalogItem(item) {
  return {
    id: item.id,
    codigo: item.codigo,
    descripcion: item.descripcion,
    marca: item.marca,
    categoria: item.categoria,
    familia: item.familia,
    subfamilia: item.subfamilia,
    estado: item.estado,
    unidadMedida: item.unidadMedida,
    unidadCompra: item.unidadCompra,
    stockActual: item.stockActual,
    stockMinimo: item.stockMinimo,
    puntoPedido: item.puntoPedido,
    ubicacion: item.ubicacion,
    documentacionUrl: item.documentacionUrl,
    foto: item.foto || null,
    ofertas: [],
  };
}

function safeRequestOrder(order) {
  const history = (order.requestStatusHistory || []).map((entry) => ({
    id: entry.id,
    status: entry.status,
    message: entry.message,
    createdAt: entry.createdAt,
    changedBy: entry.changedBy ? { id: entry.changedBy.id, nombre: entry.changedBy.nombre } : null,
  }));
  const lastWithMessage = [...history].reverse().find((entry) => entry.message);
  return {
    id: order.id,
    numeroOrden: order.numeroOrden,
    fechaEmision: order.fechaEmision,
    fechaEntregaEsperada: order.fechaEntregaEsperada,
    observaciones: order.observaciones,
    lugarEntrega: order.lugarEntrega,
    requesterVisibleStatus: order.requesterVisibleStatus,
    proveedor: safeSupplier(order.proveedor),
    items: (order.items || []).map((line) => ({
      id: line.id,
      cantidad: line.cantidad,
      unidad: line.unidadSolicitada || line.producto?.unidadMedida || line.producto?.unidadCompra || 'u.',
      codigo: line.codigoProveedor || line.producto?.codigo || null,
      descripcion: line.nombreProveedor || line.producto?.descripcion || 'Ítem solicitado',
    })),
    history,
    lastMessage: lastWithMessage?.message || null,
    updatedAt: order.updatedAt,
  };
}

function validateVisibleStatusUpdate(user, body) {
  if (user?.role !== 'SYSTEM_ADMIN') {
    const error = new Error('Solo un administrador puede actualizar el seguimiento visible.');
    error.statusCode = 403;
    throw error;
  }
  if (!body || !REQUEST_VISIBLE_STATUSES.includes(body.status)) throw new Error('Estado visible inválido.');
  const message = text(body.message, 1000);
  return { status: body.status, message };
}

module.exports = {
  REQUEST_VISIBLE_STATUSES,
  canReadOrder,
  isRequester,
  requesterCapabilities,
  safeCatalogItem,
  safeRequestOrder,
  safeSupplier,
  validateRequesterSubmission,
  validateVisibleStatusUpdate,
};
