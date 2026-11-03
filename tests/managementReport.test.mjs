import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { formatMoney } from '../src/utils/purchaseMoney.mjs';

const require = createRequire(import.meta.url);

test('Dashboard gerencial con datos Prisma y permisos HTTP', async (t) => {
  const folder = await mkdtemp(join('prisma', 'test-management-'));
  let prisma;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await prisma?.$disconnect();
    await rm(folder, { recursive: true, force: true });
  });
  await writeFile(join(folder, 'orders.db'), '');
  process.env.DATABASE_URL = 'file:./' + basename(folder) + '/orders.db';
  const pkg = require.resolve('prisma/package.json');
  execFileSync(process.execPath, [join(dirname(pkg), require(pkg).bin.prisma), 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate']);
  const app = require('../server/server.js');
  prisma = app.prisma;
  const { managementReport } = require('../server/managementReport');
  const { signToken } = require('../server/auth');
  const finance = await prisma.user.create({ data: { username: 'fin', nombre: 'Finanzas', passwordHash: 'fixture', role: 'FINANCE' } });
  const requester = await prisma.user.create({ data: { username: 'req', nombre: 'Solicitante', passwordHash: 'fixture', role: 'REQUESTER' } });
  await prisma.delegation.create({ data: { delegatorId: finance.id, delegateId: requester.id,
    startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000) } });
  const suppliers = [];
  for (const nombre of ['Uno', 'Dos', 'Tres', 'Cuatro']) {
    suppliers.push(await prisma.supplier.create({ data: { nombre, taxId: nombre } }));
  }
  const item = await prisma.item.create({ data: { codigo: 'M1', descripcion: 'Acero' } });
  const free = await prisma.item.create({ data: { codigo: '__ITEM_LIBRE_OC__', descripcion: 'Libre' } });
  const insert = (number, proveedor, fechaEmision, estado, total, extra = {}) => prisma.purchaseOrder.create({
    data: { numeroOrden: 'OC-' + number, proveedorId: suppliers[proveedor].id,
      fechaEmision: new Date(fechaEmision), estado, total, costCenter: 'Planta', ...extra },
  });
  await insert('SEP', 0, '2026-10-01T02:59:59Z', 'RECIBIDA', '100');
  await insert('SEP-X', 0, '2026-09-15T12:00:00Z', 'CANCELADA', '999');
  const first = await insert('A', 0, '2026-10-01T03:00:00Z', 'ENVIADA', '200.1234', {
    fechaEntregaEsperada: new Date('2026-10-20T15:00:00Z'),
    items: { create: [
      { productoId: item.id, cantidad: 2, precioUnitario: '12.3456', subtotalLinea: '24.6912' },
      { productoId: free.id, nombreProveedor: 'Servicio A', cantidad: 1, precioUnitario: '10', subtotalLinea: '10' },
      { productoId: free.id, nombreProveedor: 'Servicio B', cantidad: 1, precioUnitario: '20', subtotalLinea: '20' },
    ] },
  });
  await insert('B', 1, '2026-10-10T12:00:00Z', 'BORRADOR', '80');
  await insert('C', 2, '2026-10-10T12:00:00Z', 'APROBADA', '40');
  await insert('D', 3, '2026-10-10T12:00:00Z', 'RECIBIDA', '20', { costCenter: 'Taller' });
  await insert('X', 0, '2026-10-12T12:00:00Z', 'CANCELADA', '9000');
  await insert('USD', 1, '2026-10-12T12:00:00Z', 'APROBADA', '10', { moneda: 'USD' });
  await insert('NOV', 0, '2026-11-01T03:00:00Z', 'ENVIADA', '1000');
  const from = '2026-10';
  const now = new Date('2026-11-03T12:00:00Z');

  const report = await managementReport(prisma, { from, to: from }, now);
  const ars = report.monetary.find(({ moneda }) => moneda === 'ARS');
  assert.equal(ars.kpis.spend.toString(), '340.1234');
  assert.equal(ars.kpis.ticket.toString(), '85.03085');
  assert.equal(formatMoney(ars.kpis.spend.toString()).endsWith('340,12'), true);
  assert.equal(report.kpis.count, 6);
  assert.equal(report.kpis.validCount, 5);
  assert.equal(report.previousCount, 1);
  assert.equal(ars.previous.validCount, 1);
  const canceled = await managementReport(prisma, { from, status: 'CANCELADA' }, now);
  assert.equal(canceled.kpis.count, 1);
  assert.equal(canceled.kpis.validCount, 0);
  assert.equal(canceled.statusDistribution.find((row) => row.estado === 'CANCELADA').count, 1);
  assert.equal(report.kpis.suppliers, 4);
  assert.equal(ars.pending.toString(), '320.1234');
  assert.equal(ars.previous.spend.toString(), '100');
  assert.equal(ars.monthlySpend.at(-1).spend.toString(), '340.1234');
  assert.ok(Math.abs(ars.monthlySpend.at(-1).change - 240.1234) < .000001);
  assert.equal(ars.supplierSpend[0].total.toString(), '200.1234');
  assert.ok(Math.abs(ars.top3 - (320.1234 / 340.1234 * 100)) < .000001);
  assert.deepEqual(ars.itemSpend.map((line) => [line.name, line.total.toString()]), [['Acero', '24.6912'], ['Servicio B', '20'], ['Servicio A', '10']]);
  assert.equal(report.statusDistribution.find((row) => row.estado === 'CANCELADA').count, 1);
  assert.equal(report.criticalOrders[0].id, first.id);
  assert.equal(report.criticalOrders[0].priority, 1);
  assert.equal((await prisma.orderItem.findFirst({ where: { ordenId: first.id, productoId: item.id } })).precioUnitario.toString(), '12.3456');

  for (const [filter, count] of [
    [{ supplierId: String(suppliers[0].id) }, 2],
    [{ costCenter: 'Taller' }, 1],
    [{ status: 'RECIBIDA' }, 1],
    [{ q: 'oc-a', supplierId: String(suppliers[0].id), costCenter: 'Planta', status: 'ENVIADA' }, 1],
    [{ q: 'tres', status: 'ENVIADA' }, 0],
  ]) {
    assert.equal((await managementReport(prisma, { from, ...filter }, now)).kpis.count, count);
  }

  server = app.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/dashboard/management';
  const request = (user, query = '?from=2026-10') => fetch(endpoint + query, {
    headers: { Authorization: 'Bearer ' + signToken(user) },
  });
  const allowed = await request(finance);
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).monetary[0].kpis.spend, '340.1234');
  const denied = await request(requester);
  assert.equal(denied.status, 403);
  assert.deepEqual(Object.keys(await denied.json()), ['error']);
  assert.equal((await request(finance, '?from=2026-13')).status, 400);

  const expensive = await insert('HIGH', 0, '2026-10-31T12:00:00Z', 'ENVIADA', '999999');
  const updated = await managementReport(prisma, { from }, now);
  assert.equal(updated.kpis.attention, 2);
  assert.ok(updated.criticalOrders.some((order) => order.numeroOrden === 'OC-B' && order.priority === 2));
  assert.ok(!updated.criticalOrders.some((order) => order.id === expensive.id));
});
