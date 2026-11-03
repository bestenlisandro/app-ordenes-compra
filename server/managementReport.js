const { Prisma, OrderStatus } = require('@prisma/client');

const OPEN = ['BORRADOR', 'ENVIADA', 'APROBADA'];
const DAY = 86400000;
const OFFSET = 3 * 3600000;
const monthOf = (date) => new Date(date.getTime() - OFFSET).toISOString().slice(0, 7);
const dayOf = (date) => Math.floor((date.getTime() - OFFSET) / DAY);
const startOf = (month) => new Date(month + '-01T03:00:00Z');
function shift(month, count) {
  const date = startOf(month);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}
const monthCount = (from, to) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5));
const zero = () => new Prisma.Decimal(0);
const ratio = (value, base) => base.gt(0) ? value.div(base).mul(100).toNumber() : null;

function parseFilters(query, now) {
  const { from = monthOf(now), to = from, supplierId, costCenter, status, q } = query;
  const monthPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
  if ([from, to].some((value) => typeof value !== 'string' || !monthPattern.test(value))
      || from > to || monthCount(from, to) >= 24
      || (supplierId !== undefined && (typeof supplierId !== 'string' || !/^\d+$/.test(supplierId) || +supplierId < 1 || +supplierId > 2147483647))
      || (status !== undefined && !Object.values(OrderStatus).includes(status))
      || [costCenter, q].some((value) => value !== undefined && (typeof value !== 'string' || value.length > 200))) {
    throw Object.assign(new Error('Filtros inválidos. Elegí un período de hasta 24 meses.'), { statusCode: 400 });
  }
  return { from, to, supplierId, costCenter, status, q: q?.trim().toLowerCase() };
}

function summarize(orders) {
  const valid = orders.filter((order) => order.estado !== 'CANCELADA');
  const spend = valid.reduce((total, order) => total.plus(order.total), zero());
  return {
    spend, count: orders.length, validCount: valid.length,
    ticket: valid.length ? spend.div(valid.length) : zero(),
    suppliers: new Set(valid.map((order) => order.proveedorId).filter(Boolean)).size,
  };
}

function attention(orders, now) {
  const today = dayOf(now);
  const open = orders.filter((order) => OPEN.includes(order.estado));
  // Alto valor relativo: cuartil superior con al menos cuatro importes positivos en la misma moneda.
  const thresholds = new Map();
  for (const currency of new Set(open.map((order) => order.moneda))) {
    const values = open.filter((order) => order.moneda === currency && order.total.gt(0))
      .map((order) => order.total).sort((a, b) => a.cmp(b));
    if (values.length >= 4 && !values[0].eq(values.at(-1))) thresholds.set(currency, values[Math.floor(values.length * .75)]);
  }
  return open.flatMap((order) => {
    const late = order.fechaEntregaEsperada ? today - dayOf(order.fechaEntregaEsperada) : 0;
    const age = today - dayOf(order.fechaEmision);
    const threshold = thresholds.get(order.moneda);
    const overdue = late > 0;
    const high = threshold && order.total.gte(threshold);
    const old = order.estado === 'BORRADOR' && age >= 14;
    if (!overdue && !high && !old) return [];
    return [{ ...order, priority: overdue ? 1 : high ? 2 : 3, days: overdue ? late : old ? age : 0,
      reason: overdue ? `Entrega vencida hace ${late} d` : high ? 'Monto en el cuartil superior de órdenes abiertas' : `Borrador de ${age} días` }];
  }).sort((a, b) => a.priority - b.priority || b.days - a.days
    || (a.moneda === b.moneda ? b.total.cmp(a.total) : a.moneda.localeCompare(b.moneda)) || b.id - a.id);
}

async function managementReport(db, query, now = new Date()) {
  const { from, to, supplierId, costCenter, status, q } = parseFilters(query, now);
  const previousFrom = shift(from, -monthCount(from, to) - 1);
  const chartFrom = shift(to, -Math.max(5, monthCount(from, to)));
  const earliest = [previousFrom, shift(chartFrom, -1)].sort()[0];
  const where = {
    fechaEmision: { gte: startOf(earliest), lt: startOf(shift(to, 1)) },
    ...(supplierId ? { proveedorId: Number(supplierId) } : {}),
    ...(costCenter ? { costCenter } : {}),
    ...(status ? { estado: status } : {}),
  };
  const [suppliers, centers, records] = await Promise.all([
    db.supplier.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    db.purchaseOrder.groupBy({ by: ['costCenter'], where: { costCenter: { not: null } }, orderBy: { costCenter: 'asc' } }),
    db.purchaseOrder.findMany({ where, select: {
      id: true, numeroOrden: true, proveedorId: true, proveedor: { select: { nombre: true } },
      costCenter: true, fechaEmision: true, fechaEntregaEsperada: true, moneda: true, total: true, estado: true,
    } }),
  ]);
  const orders = records.filter((order) => !q || [order.numeroOrden, order.proveedor?.nombre].some((name) => name?.toLowerCase().includes(q)))
    .map((order) => ({ ...order, month: monthOf(order.fechaEmision) }));
  const current = orders.filter((order) => order.month >= from);
  const prior = orders.filter((order) => order.month >= previousFrom && order.month < from);
  const valid = current.filter((order) => order.estado !== 'CANCELADA');
  const critical = attention(current, now);
  const currencies = [...new Set(orders.map((order) => order.moneda))].sort();
  const linesByCurrency = await Promise.all(currencies.map((moneda) => {
    const selected = valid.filter((order) => order.moneda === moneda);
    if (!selected.length) return [];
    return db.orderItem.groupBy({
      by: ['productoId', 'nombreProveedor', 'codigoProveedor', 'unidadSolicitada'],
      where: { orden: {
        ...where, fechaEmision: { ...where.fechaEmision, gte: startOf(from) }, moneda,
        estado: status || { not: 'CANCELADA' },
        ...(q ? { id: { in: selected.map((order) => order.id) } } : {}),
      } },
      _sum: { cantidad: true, subtotalLinea: true },
    });
  }));
  const productIds = [...new Set(linesByCurrency.flat().map((line) => line.productoId))];
  const products = productIds.length ? await db.item.findMany({
    where: { id: { in: productIds } },
    select: { id: true, codigo: true, descripcion: true, unidadMedida: true, unidadCompra: true },
  }) : [];
  const catalog = new Map(products.map((product) => [product.id, product]));
  const monetary = currencies.map((moneda, index) => {
    const selected = current.filter((order) => order.moneda === moneda);
    const kpis = summarize(selected);
    const previous = summarize(prior.filter((order) => order.moneda === moneda));
    const bySupplier = new Map();
    for (const order of selected.filter((entry) => entry.estado !== 'CANCELADA' && entry.proveedorId)) {
      const supplier = bySupplier.get(order.proveedorId) ?? { id: order.proveedorId, name: order.proveedor?.nombre, total: zero(), count: 0 };
      supplier.total = supplier.total.plus(order.total);
      supplier.count++;
      bySupplier.set(supplier.id, supplier);
    }
    const supplierSpend = [...bySupplier.values()].sort((a, b) => b.total.cmp(a.total))
      .map((supplier) => ({ ...supplier, share: ratio(supplier.total, kpis.spend) }));
    const items = new Map();
    for (const line of linesByCurrency[index]) {
      const product = catalog.get(line.productoId);
      const free = !product || product.codigo.startsWith('__ITEM_LIBRE');
      const name = free ? line.nombreProveedor || 'Ítem libre' : product.descripcion;
      const unit = line.unidadSolicitada || (!free && (product.unidadCompra || product.unidadMedida)) || null;
      const key = JSON.stringify([line.productoId, free ? line.codigoProveedor : null, free ? name : null, unit]);
      const item = items.get(key) ?? { key, name, unit, quantity: zero(), total: zero() };
      item.quantity = item.quantity.plus(line._sum.cantidad);
      item.total = item.total.plus(line._sum.subtotalLinea);
      items.set(key, item);
    }
    const itemSpend = [...items.values()].sort((a, b) => b.total.cmp(a.total));
    const lineSpend = itemSpend.reduce((sum, item) => sum.plus(item.total), zero());
    const openValueByStatus = OPEN.map((estado) => ({
      estado, total: selected.filter((order) => order.estado === estado).reduce((sum, order) => sum.plus(order.total), zero()),
    }));
    const monthly = new Map();
    for (const order of orders.filter((entry) => entry.moneda === moneda)) {
      const bucket = monthly.get(order.month) ?? [];
      bucket.push(order);
      monthly.set(order.month, bucket);
    }
    const monthSummary = (month) => summarize(monthly.get(month) ?? []);
    const monthlySpend = Array.from({ length: monthCount(chartFrom, to) + 1 }, (_, offset) => {
      const month = shift(chartFrom, offset);
      const summary = monthSummary(month);
      const base = monthSummary(shift(month, -1)).spend;
      return { month, ...summary, change: ratio(summary.spend.minus(base), base) };
    });
    return {
      moneda, kpis, previous, monthlySpend, supplierSpend,
      top3: ratio(supplierSpend.slice(0, 3).reduce((sum, supplier) => sum.plus(supplier.total), zero()), kpis.spend),
      itemSpend: itemSpend.slice(0, 10).map((item) => ({ ...item, share: ratio(item.total, lineSpend) })),
      openValueByStatus, pending: openValueByStatus.reduce((sum, row) => sum.plus(row.total), zero()),
      topOrders: selected.filter((order) => order.estado !== 'CANCELADA').sort((a, b) => b.total.cmp(a.total)).slice(0, 5),
    };
  });
  return {
    filters: { from, to, previousFrom, previousTo: shift(from, -1) },
    suppliers, centers: centers.map((row) => row.costCenter).filter(Boolean), monetary,
    kpis: { ...summarize(current), spend: undefined, ticket: undefined, attention: critical.length },
    previousCount: prior.length,
    statusDistribution: Object.values(OrderStatus).map((estado) => ({ estado, count: current.filter((order) => order.estado === estado).length })),
    criticalOrders: critical.slice(0, 7),
  };
}

module.exports = { managementReport };
