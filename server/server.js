require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient, OrderStatus } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 4000);
const TAX_RATE = Number(process.env.TAX_RATE || 0.21);

app.use(cors());
app.use(express.json());

const decimal = (value) => Number(value);
const includesOrder = {
  proveedor: true,
  items: { include: { producto: true } },
};

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${field} es obligatorio.`);
  return value.trim();
}

function handleError(res, error) {
  console.error(error);
  if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con ese valor único.' });
  if (error.code === 'P2003') return res.status(409).json({ error: 'No se puede eliminar: el registro está en uso.' });
  return res.status(400).json({ error: error.message || 'No se pudo procesar la solicitud.' });
}

// CRUD de proveedores
app.get('/api/suppliers', async (_req, res) => res.json(await prisma.supplier.findMany({ orderBy: { nombre: 'asc' } })));
app.post('/api/suppliers', async (req, res) => {
  try { res.status(201).json(await prisma.supplier.create({ data: { nombre: requiredString(req.body.nombre, 'nombre'), taxId: requiredString(req.body.taxId, 'CUIT/TaxID'), email: req.body.email || null, telefono: req.body.telefono || null, direccion: req.body.direccion || null } })); } catch (e) { handleError(res, e); }
});
app.put('/api/suppliers/:id', async (req, res) => {
  try { res.json(await prisma.supplier.update({ where: { id: Number(req.params.id) }, data: { nombre: requiredString(req.body.nombre, 'nombre'), taxId: requiredString(req.body.taxId, 'CUIT/TaxID'), email: req.body.email || null, telefono: req.body.telefono || null, direccion: req.body.direccion || null } })); } catch (e) { handleError(res, e); }
});
app.delete('/api/suppliers/:id', async (req, res) => { try { await prisma.supplier.delete({ where: { id: Number(req.params.id) } }); res.status(204).end(); } catch (e) { handleError(res, e); } });

// CRUD de productos
app.get('/api/items', async (_req, res) => res.json(await prisma.item.findMany({ orderBy: { codigo: 'asc' } })));
app.post('/api/items', async (req, res) => {
  try { const precio = Number(req.body.precioUnitario); if (!(precio > 0)) throw new Error('El precio unitario debe ser mayor a cero.'); res.status(201).json(await prisma.item.create({ data: { codigo: requiredString(req.body.codigo, 'código'), descripcion: requiredString(req.body.descripcion, 'descripción'), precioUnitario: precio } })); } catch (e) { handleError(res, e); }
});
app.put('/api/items/:id', async (req, res) => {
  try { const precio = Number(req.body.precioUnitario); if (!(precio > 0)) throw new Error('El precio unitario debe ser mayor a cero.'); res.json(await prisma.item.update({ where: { id: Number(req.params.id) }, data: { codigo: requiredString(req.body.codigo, 'código'), descripcion: requiredString(req.body.descripcion, 'descripción'), precioUnitario: precio } })); } catch (e) { handleError(res, e); }
});
app.delete('/api/items/:id', async (req, res) => { try { await prisma.item.delete({ where: { id: Number(req.params.id) } }); res.status(204).end(); } catch (e) { handleError(res, e); } });

// Stock: ajustes manuales y consulta de existencias.
app.get('/api/stock', async (_req, res) => res.json(await prisma.item.findMany({ orderBy: { codigo: 'asc' } })));
app.post('/api/stock/movements', async (req, res) => {
  try {
    const productoId = Number(req.body.productoId); const cantidad = Number(req.body.cantidad);
    if (!Number.isInteger(productoId) || !(cantidad > 0) || !['ENTRADA', 'SALIDA', 'AJUSTE'].includes(req.body.tipo)) throw new Error('Datos de movimiento inválidos.');
    const producto = await prisma.item.findUnique({ where: { id: productoId } });
    if (!producto) throw new Error('Producto inexistente.');
    const factor = req.body.tipo === 'SALIDA' ? -1 : 1;
    const nuevoStock = decimal(producto.stockActual) + cantidad * factor;
    if (nuevoStock < 0) throw new Error('El movimiento dejaría el stock en negativo.');
    const result = await prisma.$transaction([
      prisma.item.update({ where: { id: productoId }, data: { stockActual: nuevoStock } }),
      prisma.stockMovement.create({ data: { productoId, tipo: req.body.tipo, cantidad: cantidad * factor, motivo: req.body.motivo?.trim() || null } }),
    ]);
    res.status(201).json(result[0]);
  } catch (e) { handleError(res, e); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { proveedorId, fechaEntregaEsperada, observaciones, items } = req.body;
    if (!Number.isInteger(proveedorId)) throw new Error('Debe seleccionar un proveedor.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('La orden debe tener al menos un ítem.');
    const productIds = items.map((item) => Number(item.productoId));
    const products = await prisma.item.findMany({ where: { id: { in: productIds } } });
    if (products.length !== new Set(productIds).size) throw new Error('Uno o más productos no existen.');
    const productById = new Map(products.map((product) => [product.id, product]));
    const lineas = items.map((item) => {
      const cantidad = Number(item.cantidad);
      const producto = productById.get(Number(item.productoId));
      if (!producto || !(cantidad > 0)) throw new Error('Cada ítem debe tener producto y cantidad mayor a cero.');
      const precioUnitario = item.precioUnitario == null ? decimal(producto.precioUnitario) : Number(item.precioUnitario);
      if (!(precioUnitario > 0)) throw new Error('El precio unitario debe ser mayor a cero.');
      return { productoId: producto.id, cantidad, precioUnitario, subtotalLinea: cantidad * precioUnitario };
    });
    const subtotal = lineas.reduce((sum, item) => sum + item.subtotalLinea, 0);
    const impuestos = subtotal * TAX_RATE;
    const numeroOrden = `OC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const order = await prisma.purchaseOrder.create({ data: { numeroOrden, proveedorId, fechaEntregaEsperada: fechaEntregaEsperada ? new Date(fechaEntregaEsperada) : null, observaciones: observaciones?.trim() || null, subtotal, impuestos, total: subtotal + impuestos, items: { create: lineas } }, include: includesOrder });
    res.status(201).json(order);
  } catch (e) { handleError(res, e); }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { estado, proveedorId, desde, hasta, q } = req.query;
    const where = {
      ...(estado && Object.values(OrderStatus).includes(estado) ? { estado } : {}),
      ...(proveedorId ? { proveedorId: Number(proveedorId) } : {}),
      ...(desde || hasta ? { fechaEmision: { ...(desde ? { gte: new Date(desde) } : {}), ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {}) } } : {}),
      ...(q ? { OR: [{ numeroOrden: { contains: q } }, { proveedor: { nombre: { contains: q } } }] } : {}),
    };
    res.json(await prisma.purchaseOrder.findMany({ where, include: { proveedor: true, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { handleError(res, e); }
});
app.get('/api/orders/:id', async (req, res) => { const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include: includesOrder }); return order ? res.json(order) : res.status(404).json({ error: 'Orden no encontrada.' }); });
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    if (!Object.values(OrderStatus).includes(req.body.estado)) throw new Error('Estado inválido.');
    const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
    const actions = [prisma.purchaseOrder.update({ where: { id: order.id }, data: { estado: req.body.estado } })];
    // Una orden recibida ingresa sus unidades al stock solo la primera vez.
    if (req.body.estado === 'RECIBIDA' && order.estado !== 'RECIBIDA') order.items.forEach((line) => { actions.push(prisma.item.update({ where: { id: line.productoId }, data: { stockActual: { increment: line.cantidad } } })); actions.push(prisma.stockMovement.create({ data: { productoId: line.productoId, tipo: 'ENTRADA_OC', cantidad: line.cantidad, motivo: `Recepción ${order.numeroOrden}` } })); });
    const result = await prisma.$transaction(actions); res.json(result[0]);
  } catch (e) { handleError(res, e); }
});

app.get('/api/reports/purchases', async (_req, res) => {
  const orders = await prisma.purchaseOrder.findMany({ include: { proveedor: true }, where: { estado: { not: 'CANCELADA' } } });
  const bySupplier = Object.values(orders.reduce((acc, order) => { const key = order.proveedor.nombre; acc[key] ||= { nombre: key, total: 0 }; acc[key].total += decimal(order.total); return acc; }, {}));
  const byStatus = Object.values(orders.reduce((acc, order) => { acc[order.estado] ||= { estado: order.estado, cantidad: 0, total: 0 }; acc[order.estado].cantidad += 1; acc[order.estado].total += decimal(order.total); return acc; }, {}));
  res.json({ bySupplier, byStatus });
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Error interno del servidor.' }); });

// En producción Express entrega la interfaz compilada y la API desde una sola URL.
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(distPath, 'index.html'));
    next();
  });
}
app.listen(PORT, () => console.log(`API disponible en http://localhost:${PORT}`));
