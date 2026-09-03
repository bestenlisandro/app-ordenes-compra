require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { materialPhoto, packMaterialMedia, unpackMaterialMedia } = require('./materialPhoto');
const { PrismaClient, OrderStatus } = require('@prisma/client');
const { ROLE_PERMISSIONS, hashPassword, verifyPassword, signToken, readToken, publicUser } = require('./auth');

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 4000);
const TAX_RATE = Number(process.env.TAX_RATE || 0.21);

app.use(cors());
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const roles = Object.keys(ROLE_PERMISSIONS);
const audit = (req, action, entity, entityId, details) => prisma.auditLog.create({ data: { userId: req.user?.id || null, action, entity, entityId: entityId == null ? null : String(entityId), details: details ? JSON.stringify(details) : null, ipAddress: req.ip } }).catch(console.error);

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active || !verifyPassword(req.body.password, user.passwordHash)) { await prisma.auditLog.create({ data: { action: 'LOGIN_FAILED', entity: 'AUTH', details: JSON.stringify({ username }), ipAddress: req.ip } }); return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); }
  await prisma.auditLog.create({ data: { userId: user.id, action: 'LOGIN', entity: 'AUTH', ipAddress: req.ip } });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.use('/api', async (req, res, next) => {
  // Compatibilidad con el health check histórico de Render. No expone órdenes.
  if (req.method === 'GET' && req.path === '/orders' && !req.headers.authorization) return res.json({ ok: true, health: true });
  const data = readToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
  if (!data) return res.status(401).json({ error: 'La sesión no es válida o venció.' });
  const user = await prisma.user.findUnique({ where: { id: Number(data.sub) } });
  if (!user?.active) return res.status(401).json({ error: 'Usuario inactivo.' });
  const now = new Date();
  const delegated = await prisma.delegation.findMany({ where: { delegateId: user.id, active: true, startsAt: { lte: now }, endsAt: { gte: now } }, include: { delegator: true } });
  req.user = publicUser(user, delegated.map((d) => d.delegator.role)); next();
});
const permit = (...permissions) => (req, res, next) => permissions.some((p) => req.user.permissions.includes(p)) ? next() : res.status(403).json({ error: 'No tiene permisos para realizar esta acción.' });

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
app.get('/api/users', permit('users:manage','delegations:create'), async (_req, res) => res.json((await prisma.user.findMany({ where: { active: true }, orderBy: { nombre: 'asc' } })).map((u) => publicUser(u))));
app.post('/api/users', permit('users:manage'), async (req, res) => { try { if (!roles.includes(req.body.role)) throw new Error('Rol inválido.'); const user = await prisma.user.create({ data: { username: requiredString(req.body.username, 'usuario').toLowerCase(), passwordHash: hashPassword(req.body.password), nombre: requiredString(req.body.nombre, 'nombre'), email: optionalString(req.body.email), role: req.body.role, costCenter: optionalString(req.body.costCenter), approvalLimit: req.body.approvalLimit === '' || req.body.approvalLimit == null ? null : Number(req.body.approvalLimit), supplierId: req.body.supplierId ? Number(req.body.supplierId) : null } }); await audit(req, 'CREATE', 'USER', user.id, { role: user.role }); res.status(201).json(publicUser(user)); } catch(e) { handleError(res,e); } });
app.patch('/api/users/:id', permit('users:manage'), async (req,res)=>{ try { const data = {}; for (const key of ['nombre','email','costCenter']) if (key in req.body) data[key]=optionalString(req.body[key]); if ('active' in req.body) data.active=Boolean(req.body.active); if (req.body.role) { if(!roles.includes(req.body.role)) throw new Error('Rol inválido.'); data.role=req.body.role; } if ('approvalLimit' in req.body) data.approvalLimit=req.body.approvalLimit===''?null:Number(req.body.approvalLimit); if(req.body.password) data.passwordHash=hashPassword(req.body.password); const user=await prisma.user.update({where:{id:Number(req.params.id)},data}); await audit(req,'UPDATE','USER',user.id,{fields:Object.keys(data)}); res.json(publicUser(user)); }catch(e){handleError(res,e)} });
app.get('/api/delegations', permit('delegations:create','delegations:manage'), async (req,res)=>res.json(await prisma.delegation.findMany({where:req.user.role==='SYSTEM_ADMIN'?{}:{OR:[{delegatorId:req.user.id},{delegateId:req.user.id}]},include:{delegator:{select:{id:true,nombre:true,role:true}},delegate:{select:{id:true,nombre:true,role:true}}},orderBy:{createdAt:'desc'}})));
app.post('/api/delegations', permit('delegations:create','delegations:manage'), async (req,res)=>{try{const delegatorId=req.user.role==='SYSTEM_ADMIN'&&req.body.delegatorId?Number(req.body.delegatorId):req.user.id;const delegateId=Number(req.body.delegateId),startsAt=new Date(req.body.startsAt),endsAt=new Date(req.body.endsAt);if(delegateId===delegatorId||Number.isNaN(startsAt.getTime())||!(endsAt>startsAt))throw new Error('Delegación inválida.');const delegation=await prisma.delegation.create({data:{delegatorId,delegateId,startsAt,endsAt}});await audit(req,'CREATE','DELEGATION',delegation.id);res.status(201).json(delegation)}catch(e){handleError(res,e)}});
app.get('/api/audit', permit('audit:read'), async (_req,res)=>res.json(await prisma.auditLog.findMany({include:{user:{select:{username:true,nombre:true}}},orderBy:{createdAt:'desc'},take:250})));

const decimal = (value) => Number(value);
const includesOrder = {
  proveedor: true,
  items: { include: { producto: true } },
};

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${field} es obligatorio.`);
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function supplierData(body) {
  const tiempoEntrega = body.tiempoEntrega === '' || body.tiempoEntrega == null ? null : Number(body.tiempoEntrega);
  const calificacion = body.calificacion === '' || body.calificacion == null ? null : Number(body.calificacion);
  if (calificacion != null && (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5)) throw new Error('La calificación debe estar entre 1 y 5.');
  const archivos = Array.isArray(body.archivos) ? body.archivos : [];
  if (archivos.length > 5) throw new Error('Puede adjuntar hasta 5 archivos.');
  archivos.forEach((archivo) => {
    if (!archivo || typeof archivo.nombre !== 'string' || typeof archivo.tipo !== 'string' || typeof archivo.datos !== 'string' || !archivo.datos.startsWith('data:')) throw new Error('Uno de los archivos adjuntos no es válido.');
    if (archivo.datos.length > 4_000_000) throw new Error(`El archivo ${archivo.nombre} supera el límite de 3 MB.`);
  });
  if (tiempoEntrega != null && (!Number.isInteger(tiempoEntrega) || tiempoEntrega < 0)) throw new Error('El tiempo de entrega debe ser una cantidad de días válida.');
  return {
    nombre: requiredString(body.nombre, 'nombre'),
    taxId: requiredString(body.taxId, 'CUIT/TaxID'),
    email: optionalString(body.email),
    telefono: optionalString(body.telefono),
    contacto: optionalString(body.contacto),
    razonSocial: optionalString(body.razonSocial),
    tiempoEntrega,
    direccion: optionalString(body.direccion),
    ciudad: optionalString(body.ciudad),
    provincia: optionalString(body.provincia),
    pais: optionalString(body.pais),
    numero: optionalString(body.numero),
    piso: optionalString(body.piso),
    codigoPostal: optionalString(body.codigoPostal),
    condicionIva: optionalString(body.condicionIva),
    sitioWeb: optionalString(body.sitioWeb),
    horarioAtencion: optionalString(body.horarioAtencion),
    condicionPago: optionalString(body.condicionPago),
    moneda: optionalString(body.moneda) || 'ARS',
    listaPrecios: optionalString(body.listaPrecios),
    descuentoVolumen: optionalString(body.descuentoVolumen),
    costoEnvio: optionalString(body.costoEnvio),
    calificacion,
    notasInternas: optionalString(body.notasInternas),
    categoriaProductos: optionalString(body.categoriaProductos),
    archivos: archivos.length ? JSON.stringify(archivos) : null,
  };
}

function materialData(body) {
  const puntoPedido = body.puntoPedido === '' || body.puntoPedido == null ? 0 : Number(body.puntoPedido);
  if (!Number.isFinite(puntoPedido) || puntoPedido < 0) throw new Error('El punto de pedido debe ser un número válido.');
  const ofertas = Array.isArray(body.ofertas) ? body.ofertas.map((oferta) => {
    const proveedorId = Number(oferta.proveedorId);
    const precioSinIva = Number(oferta.precioSinIva || 0);
    const precioConIva = Number(oferta.precioConIva || 0);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) throw new Error('Cada oferta debe tener un proveedor.');
    if (precioSinIva < 0 || precioConIva < 0) throw new Error('Los precios no pueden ser negativos.');
    return {
      proveedorId,
      nombreProveedor: optionalString(oferta.nombreProveedor),
      codigoProveedor: optionalString(oferta.codigoProveedor),
      marcaProveedor: optionalString(oferta.marcaProveedor),
      esPreferido: Boolean(oferta.esPreferido),
      tiempoEntrega: oferta.tiempoEntrega === '' || oferta.tiempoEntrega == null ? null : Number(oferta.tiempoEntrega),
      loteMinimo: oferta.loteMinimo === '' || oferta.loteMinimo == null ? 1 : Number(oferta.loteMinimo),
      precioSinIva,
      precioConIva,
      moneda: optionalString(oferta.moneda) || 'ARS',
      fechaActualizacionCosto: oferta.fechaActualizacionCosto ? new Date(oferta.fechaActualizacionCosto) : null,
    };
  }) : [];
  if (new Set(ofertas.map((oferta) => oferta.proveedorId)).size !== ofertas.length) throw new Error('Un proveedor no puede repetirse en el mismo material.');
  const foto = materialPhoto(body.foto);
  return {
    item: {
      codigo: requiredString(body.codigo, 'código'),
      descripcion: requiredString(body.descripcion, 'nombre del material'),
      marca: optionalString(body.marca),
      categoria: optionalString(body.categoria),
      familia: optionalString(body.familia),
      subfamilia: optionalString(body.subfamilia),
      estado: optionalString(body.estado) || 'ACTIVO',
      unidadMedida: optionalString(body.unidadMedida),
      unidadCompra: optionalString(body.unidadCompra),
      factorConversion: body.factorConversion === '' || body.factorConversion == null ? 1 : Number(body.factorConversion),
      codigoQr: optionalString(body.codigoQr),
      puntoPedido,
      stockMinimo: puntoPedido,
      stockMaximo: body.stockMaximo === '' || body.stockMaximo == null ? null : Number(body.stockMaximo),
      ubicacion: optionalString(body.ubicacion),
      costoEstandar: body.costoEstandar === '' || body.costoEstandar == null ? 0 : Number(body.costoEstandar),
      iva: body.iva === '' || body.iva == null ? 21 : Number(body.iva),
      atributosTecnicos: optionalString(body.atributosTecnicos),
      documentacionUrl: foto === undefined ? optionalString(body.documentacionUrl) : packMaterialMedia(body.documentacionUrl, foto),
      precioUnitario: ofertas[0]?.precioSinIva || 0,
    },
    ofertas,
  };
}

function publicMaterial(item) {
  const media = unpackMaterialMedia(item.documentacionUrl);
  return { ...item, documentacionUrl: media.documentacionUrl, foto: media.foto };
}

function handleError(res, error) {
  console.error(error);
  if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con ese valor único.' });
  if (error.code === 'P2003') return res.status(409).json({ error: 'No se puede eliminar: el registro está en uso.' });
  return res.status(400).json({ error: error.message || 'No se pudo procesar la solicitud.' });
}

// CRUD de proveedores
app.get('/api/suppliers', permit('catalog:read','orders:read'), async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { nombre: 'asc' } });
  res.json(suppliers.map((supplier) => {
    try { return { ...supplier, archivos: supplier.archivos ? JSON.parse(supplier.archivos) : [] }; }
    catch { return { ...supplier, archivos: [] }; }
  }));
});
app.post('/api/suppliers', permit('suppliers:manage'), async (req, res) => {
  try { res.status(201).json(await prisma.supplier.create({ data: supplierData(req.body) })); } catch (e) { handleError(res, e); }
});
app.put('/api/suppliers/:id', permit('suppliers:manage'), async (req, res) => {
  try { res.json(await prisma.supplier.update({ where: { id: Number(req.params.id) }, data: supplierData(req.body) })); } catch (e) { handleError(res, e); }
});
app.delete('/api/suppliers/:id', permit('suppliers:manage'), async (req, res) => { try { await prisma.supplier.delete({ where: { id: Number(req.params.id) } }); res.status(204).end(); } catch (e) { handleError(res, e); } });

// CRUD de productos
app.get('/api/items', permit('catalog:read'), async (_req, res) => res.json((await prisma.item.findMany({ include: { ofertas: { include: { proveedor: true } } }, orderBy: { codigo: 'asc' } })).map(publicMaterial)));
app.post('/api/items', permit('items:manage'), async (req, res) => {
  try { const data = materialData(req.body); res.status(201).json(publicMaterial(await prisma.item.create({ data: { ...data.item, ofertas: { create: data.ofertas } }, include: { ofertas: { include: { proveedor: true } } } }))); } catch (e) { handleError(res, e); }
});
app.post('/api/items/import', permit('items:manage'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const updateExisting = Boolean(req.body.updateExisting);
    if (!rows.length || rows.length > 1000) throw new Error('La importación debe contener entre 1 y 1000 materiales.');
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };
    for (let index = 0; index < rows.length; index += 1) {
      try {
        const row = rows[index];
        const data = materialData({ ...row, ofertas: [] });
        if (!['ACTIVO', 'INACTIVO', 'DESCONTINUACION'].includes(data.item.estado)) throw new Error('Estado inválido.');
        const stockActual = row.stockActual === '' || row.stockActual == null ? 0 : Number(row.stockActual);
        if (!Number.isFinite(stockActual) || stockActual < 0) throw new Error('El stock actual debe ser un número igual o mayor a cero.');
        const existing = await prisma.item.findUnique({ where: { codigo: data.item.codigo } });
        if (existing && !updateExisting) { results.skipped += 1; continue; }
        if (existing) {
          const previousMedia = unpackMaterialMedia(existing.documentacionUrl);
          if (previousMedia.foto) data.item.documentacionUrl = packMaterialMedia(data.item.documentacionUrl, previousMedia.foto);
          await prisma.item.update({ where: { id: existing.id }, data: { ...data.item, stockActual } });
          results.updated += 1;
        } else {
          await prisma.item.create({ data: { ...data.item, stockActual } });
          results.created += 1;
        }
      } catch (error) {
        results.errors.push({ row: Number(rows[index]?.sourceRow || index + 2), codigo: rows[index]?.codigo || '', error: error.message });
      }
    }
    await audit(req, 'BULK_IMPORT', 'ITEM', null, results);
    res.json(results);
  } catch (e) { handleError(res, e); }
});
app.put('/api/items/:id', permit('items:manage'), async (req, res) => {
  try { const data = materialData(req.body); res.json(publicMaterial(await prisma.item.update({ where: { id: Number(req.params.id) }, data: { ...data.item, ofertas: { deleteMany: {}, create: data.ofertas } }, include: { ofertas: { include: { proveedor: true } } } }))); } catch (e) { handleError(res, e); }
});
app.delete('/api/items/:id', permit('items:manage'), async (req, res) => { try { await prisma.item.delete({ where: { id: Number(req.params.id) } }); res.status(204).end(); } catch (e) { handleError(res, e); } });

// Stock: ajustes manuales y consulta de existencias.
app.get('/api/stock', permit('stock:manage'), async (_req, res) => res.json(await prisma.item.findMany({ orderBy: { codigo: 'asc' } })));
app.post('/api/stock/movements', permit('stock:manage'), async (req, res) => {
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

app.post('/api/orders', permit('orders:create'), async (req, res) => {
  try {
    const {
      proveedorId, fechaEntregaEsperada, lugarEntrega, observaciones, items,
      proveedorRazonSocial, proveedorTaxId, proveedorContacto, proveedorDireccion,
      proveedorDatosContacto, porcentajeImpuestos, descuentos, moneda,
      condicionesPago, metodoEnvio, direccionFacturacion, autorizadoPor,
      firmaAutorizacion, terminosCondiciones,
    } = req.body;
    if (!Number.isInteger(proveedorId)) throw new Error('Debe seleccionar un proveedor.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('La orden debe tener al menos un ítem.');
    const proveedor = await prisma.supplier.findUnique({ where: { id: proveedorId } });
    if (!proveedor) throw new Error('El proveedor seleccionado no existe.');
    const productIds = items.map((item) => Number(item.productoId));
    const products = await prisma.item.findMany({ where: { id: { in: productIds } }, include: { ofertas: true } });
    if (products.length !== new Set(productIds).size) throw new Error('Uno o más productos no existen.');
    const productById = new Map(products.map((product) => [product.id, product]));
    const lineas = items.map((item) => {
      const cantidad = Number(item.cantidad);
      const producto = productById.get(Number(item.productoId));
      if (!producto || !(cantidad > 0)) throw new Error('Cada ítem debe tener producto y cantidad mayor a cero.');
      const precioUnitario = item.precioUnitario == null ? decimal(producto.precioUnitario) : Number(item.precioUnitario);
      if (!(precioUnitario > 0)) throw new Error('El precio unitario debe ser mayor a cero.');
      const equivalencia = producto.ofertas.find((oferta) => oferta.proveedorId === proveedorId);
      return {
        productoId: producto.id, cantidad, precioUnitario, subtotalLinea: cantidad * precioUnitario,
        codigoProveedor: equivalencia?.codigoProveedor || producto.codigo,
        nombreProveedor: equivalencia?.nombreProveedor || producto.descripcion,
      };
    });
    const subtotal = lineas.reduce((sum, item) => sum + item.subtotalLinea, 0);
    const tasa = porcentajeImpuestos === '' || porcentajeImpuestos == null ? TAX_RATE * 100 : Number(porcentajeImpuestos);
    const descuento = descuentos === '' || descuentos == null ? 0 : Number(descuentos);
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) throw new Error('El porcentaje de impuestos debe estar entre 0 y 100.');
    if (!Number.isFinite(descuento) || descuento < 0 || descuento > subtotal) throw new Error('El descuento debe ser válido y no superar el subtotal.');
    const impuestos = subtotal * tasa / 100;
    const fechaEntrega = fechaEntregaEsperada ? new Date(`${fechaEntregaEsperada}T12:00:00`) : null;
    if (fechaEntrega && Number.isNaN(fechaEntrega.getTime())) throw new Error('La fecha de entrega no es válida.');
    const provisional = `PENDIENTE-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseData = {
      numeroOrden: provisional, proveedorId, requestedById: req.user.id, costCenter: optionalString(req.body.costCenter) || req.user.costCenter, fechaEntregaEsperada: fechaEntrega,
      lugarEntrega: optionalString(lugarEntrega), observaciones: optionalString(observaciones),
      proveedorRazonSocial: optionalString(proveedorRazonSocial) || proveedor.razonSocial || proveedor.nombre,
      proveedorTaxId: optionalString(proveedorTaxId) || proveedor.taxId,
      proveedorContacto: optionalString(proveedorContacto) || proveedor.contacto,
      proveedorDireccion: optionalString(proveedorDireccion) || [proveedor.direccion, proveedor.ciudad, proveedor.provincia, proveedor.pais].filter(Boolean).join(', ') || null,
      proveedorDatosContacto: optionalString(proveedorDatosContacto) || [proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || null,
      porcentajeImpuestos: tasa, descuentos: descuento, moneda: optionalString(moneda) || 'ARS',
      condicionesPago: optionalString(condicionesPago), metodoEnvio: optionalString(metodoEnvio),
      direccionFacturacion: optionalString(direccionFacturacion), autorizadoPor: optionalString(autorizadoPor),
      firmaAutorizacion: optionalString(firmaAutorizacion), terminosCondiciones: optionalString(terminosCondiciones),
      subtotal, impuestos, total: subtotal + impuestos - descuento, items: { create: lineas },
    };
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({ data: baseData });
      const numeroOrden = `OC-${created.fechaEmision.getFullYear()}-${String(created.id).padStart(6, '0')}`;
      return tx.purchaseOrder.update({ where: { id: created.id }, data: { numeroOrden }, include: includesOrder });
    });
    await audit(req, 'CREATE', 'PURCHASE_ORDER', order.id, { total: Number(order.total), costCenter: order.costCenter });
    res.status(201).json(order);
  } catch (e) { handleError(res, e); }
});

app.get('/api/orders', permit('orders:read'), async (req, res) => {
  try {
    const { estado, proveedorId, desde, hasta, q } = req.query;
    const where = {
      ...(req.user.role === 'VENDOR' ? { proveedorId: req.user.supplierId || -1 } : {}),
      ...(req.user.role === 'REQUESTER' ? { requestedById: req.user.id } : {}),
      ...(estado && Object.values(OrderStatus).includes(estado) ? { estado } : {}),
      ...(proveedorId ? { proveedorId: Number(proveedorId) } : {}),
      ...(desde || hasta ? { fechaEmision: { ...(desde ? { gte: new Date(desde) } : {}), ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {}) } } : {}),
      ...(q ? { OR: [{ numeroOrden: { contains: q } }, { proveedor: { nombre: { contains: q } } }] } : {}),
    };
    res.json(await prisma.purchaseOrder.findMany({ where, include: { proveedor: true, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { handleError(res, e); }
});
app.get('/api/orders/:id', permit('orders:read'), async (req, res) => { const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include: includesOrder }); if (order && req.user.role === 'VENDOR' && order.proveedorId !== req.user.supplierId) return res.status(403).json({ error: 'No tiene acceso a esta orden.' }); return order ? res.json(order) : res.status(404).json({ error: 'Orden no encontrada.' }); });
app.patch('/api/orders/:id/status', permit('orders:approve','orders:buy','orders:receive','orders:finance'), async (req, res) => {
  try {
    if (!Object.values(OrderStatus).includes(req.body.estado)) throw new Error('Estado inválido.');
    const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
    const allowed = { SYSTEM_ADMIN: Object.values(OrderStatus), APPROVER: ['APROBADA','CANCELADA','BORRADOR'], BUYER: ['ENVIADA','CANCELADA'], RECEIVER: ['RECIBIDA'], FINANCE: [] };
    const actingRole = [req.user.role, ...(req.user.delegatedRoles || [])].find((role) => allowed[role]?.includes(req.body.estado));
    if (!actingRole) return res.status(403).json({ error: 'Su rol no permite esa transición de estado.' });
    if (actingRole === 'APPROVER' && req.body.estado === 'APROBADA' && req.user.approvalLimit != null && Number(order.total) > req.user.approvalLimit) return res.status(403).json({ error: `La orden supera su límite de aprobación (${req.user.approvalLimit}).` });
    if (actingRole === 'APPROVER' && req.user.costCenter && order.costCenter && req.user.costCenter !== order.costCenter) return res.status(403).json({ error: 'La orden pertenece a otro centro de costos.' });
    const actions = [prisma.purchaseOrder.update({ where: { id: order.id }, data: { estado: req.body.estado } })];
    // Una orden recibida ingresa sus unidades al stock solo la primera vez.
    if (req.body.estado === 'RECIBIDA' && order.estado !== 'RECIBIDA') order.items.forEach((line) => { actions.push(prisma.item.update({ where: { id: line.productoId }, data: { stockActual: { increment: line.cantidad } } })); actions.push(prisma.stockMovement.create({ data: { productoId: line.productoId, tipo: 'ENTRADA_OC', cantidad: line.cantidad, motivo: `Recepción ${order.numeroOrden}` } })); });
    const result = await prisma.$transaction(actions); await audit(req, 'STATUS_CHANGE', 'PURCHASE_ORDER', order.id, { from: order.estado, to: req.body.estado, actingRole }); res.json(result[0]);
  } catch (e) { handleError(res, e); }
});

app.get('/api/reports/purchases', permit('reports:read'), async (_req, res) => {
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
