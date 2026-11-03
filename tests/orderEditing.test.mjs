import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseUnitPrice, unitPriceInput } from '../src/utils/purchaseMoney.mjs';

const require = createRequire(import.meta.url);

test('Edición de órdenes por HTTP con Prisma y SQLite local', async (t) => {
  const folder = await mkdtemp(join('prisma', 'test-orders-'));
  await writeFile(join(folder, 'orders.db'), '');
  process.env.DATABASE_URL = 'file:./' + basename(folder) + '/orders.db';
  let closeDatabase;
  t.after(async () => {
    await closeDatabase?.();
    await rm(folder, { recursive: true, force: true });
  });
  const prismaPackage = require.resolve('prisma/package.json');
  const prismaCli = join(dirname(prismaPackage), require(prismaPackage).bin.prisma);
  execFileSync(process.execPath, [
    prismaCli, 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate',
  ], { env: process.env });
  const { app, prisma } = require('../server/server.js');
  closeDatabase = () => prisma.$disconnect();
  const { signToken } = require('../server/auth.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  closeDatabase = async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  };
  const url = 'http://127.0.0.1:' + server.address().port;
  const users = {};
  for (const role of ['SYSTEM_ADMIN', 'BUYER', 'REQUESTER']) {
    users[role] = await prisma.user.create({ data: { username: role, nombre: role, role, passwordHash: 'fixture' } });
  }
  await prisma.delegation.create({ data: {
    delegatorId: users.BUYER.id, delegateId: users.REQUESTER.id,
    startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000),
  } });
  const supplier = await prisma.supplier.create({ data: { nombre: 'Primero', taxId: 'A' } });
  const otherSupplier = await prisma.supplier.create({ data: { nombre: 'Segundo', taxId: 'B' } });
  const [first, second, third] = await Promise.all(['A', 'B', 'C'].map((code) =>
    prisma.item.create({ data: { codigo: code, descripcion: code, precioUnitario: 10 } })));
  const line = (product, cantidad, precioUnitario) => ({ productoId: product.id, cantidad, precioUnitario });
  const original = { proveedorId: supplier.id, items: [line(first, 1, 10), line(second, 1, 5)] };
  const replacement = {
    proveedorId: otherSupplier.id,
    fechaEntregaEsperada: '2026-11-10', lugarEntrega: 'Depósito', costCenter: 'Compras',
    condicionesPago: '30 días', observaciones: 'Entregar por la mañana', moneda: 'USD',
    porcentajeImpuestos: 10, descuentos: 3,
    items: [line(first, 2, 20), line(third, 1, 5), { tipo: 'LIBRE', descripcionLibre: 'Embalaje', cantidad: 1, precioUnitario: 5 }],
    id: 9000, numeroOrden: 'MANUAL', estado: 'RECIBIDA', total: 1, auditLog: { action: 'MANUAL' },
  };
  async function request(role, method, path, data) {
    const response = await fetch(url + '/api/orders' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: 'Bearer ' + signToken(users[role]) } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }
  const created = await request('SYSTEM_ADMIN', 'POST', '', original);
  assert.equal(created.status, 201);
  const { id, numeroOrden } = created.body;
  const path = '/' + id;

  await t.test('SYSTEM_ADMIN actualiza cabecera e ítems, recalcula y audita', async () => {
    const { status, body } = await request('SYSTEM_ADMIN', 'PATCH', path, replacement);
    assert.equal(status, 200);
    assert.equal(body.id, id);
    assert.equal(body.numeroOrden, numeroOrden);
    assert.equal(body.estado, 'BORRADOR');
    assert.ok(new Date(body.updatedAt) > new Date(created.body.updatedAt));
    assert.equal(body.proveedorId, otherSupplier.id);
    assert.equal(body.fechaEntregaEsperada.slice(0, 10), replacement.fechaEntregaEsperada);
    for (const field of ['lugarEntrega', 'costCenter', 'condicionesPago', 'observaciones', 'moneda']) {
      assert.equal(body[field], replacement[field]);
    }
    assert.deepEqual(body.items.map((item) => item.productoId).slice(0, 2), [first.id, third.id]);
    assert.equal(body.items.length, 3);
    assert.equal(body.items[2].nombreProveedor, 'Embalaje');
    assert.equal(Number(body.items[0].cantidad), 2);
    assert.equal(Number(body.items[0].precioUnitario), 20);
    assert.deepEqual([body.subtotal, body.impuestos, body.descuentos, body.total].map(Number), [50, 5, 3, 52]);
    assert.equal(await prisma.purchaseOrder.count(), 1);
    const logs = await prisma.auditLog.findMany({ where: { action: 'ORDER_UPDATED', entityId: String(id) } });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].userId, users.SYSTEM_ADMIN.id);
    const details = JSON.parse(logs[0].details);
    assert.ok(details.fields.includes('observaciones'));
    assert.ok(details.fields.includes('items'));
    assert.deepEqual(details.total, [Number(created.body.total), 52]);
    assert.equal(await prisma.auditLog.count({ where: { action: 'MANUAL' } }), 0);
  });

  await t.test('BUYER puede cambiar el material y un ítem inválido revierte toda la edición', async () => {
    const body = { ...original, items: [line(second, 3, 4)] };
    const updated = await request('BUYER', 'PATCH', path, body);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.items[0].productoId, second.id);
    const invalid = await request('BUYER', 'PATCH', path, {
      ...replacement, items: [...replacement.items, line(second, 0, 10)],
    });
    assert.equal(invalid.status, 400);
    const persisted = await request('BUYER', 'GET', path);
    assert.deepEqual(persisted.body, updated.body);
    assert.equal(await prisma.auditLog.count({ where: { action: 'ORDER_UPDATED' } }), 2);
  });

  await t.test('REQUESTER recibe 403 incluso con delegación y conserva su flujo de solicitudes', async () => {
    assert.equal((await request('REQUESTER', 'PATCH', path, original)).status, 403);
    assert.equal((await request(null, 'PATCH', path, original)).status, 401);
    const sent = await request('REQUESTER', 'POST', '', {
      items: [{ tipo: 'CATALOGO', productoId: first.id, cantidad: 2, unidad: 'kg' }],
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const assignment = await request('BUYER', 'PATCH', '/' + sent.body.id + '/suggested-supplier', { proveedorId: supplier.id });
    assert.equal(assignment.status, 200);
    const result = await request('REQUESTER', 'GET', '/' + sent.body.id);
    assert.equal(result.status, 200);
    assert.ok(!Object.hasOwn(result.body, 'proveedor'));
    assert.ok(!Object.hasOwn(result.body, 'total'));
    assert.ok(!Object.hasOwn(result.body.items[0], 'precioUnitario'));
  });

  for (const estado of ['ENVIADA', 'APROBADA', 'RECIBIDA', 'CANCELADA']) {
    await t.test(estado + ' rechaza cambios aunque se haya abierto como BORRADOR', async () => {
      await prisma.purchaseOrder.update({ where: { id }, data: { estado: 'BORRADOR' } });
      const opened = await request('BUYER', 'GET', path);
      assert.equal(opened.body.estado, 'BORRADOR');
      const transition = await request('SYSTEM_ADMIN', 'PATCH', path + '/status', { estado });
      assert.equal(transition.status, 200);
      const blocked = await request('BUYER', 'PATCH', path, replacement);
      assert.equal(blocked.status, 409);
      assert.equal(blocked.body.error, 'La orden solo puede editarse mientras está en estado BORRADOR.');
      const supplierChange = await request('BUYER', 'PATCH', path + '/suggested-supplier', { proveedorId: otherSupplier.id });
      assert.equal(supplierChange.status, 409);
      const persisted = await request('BUYER', 'GET', path);
      assert.equal(persisted.body.estado, estado);
      assert.equal(persisted.body.proveedorId, supplier.id);
      assert.equal(await prisma.auditLog.count({ where: { action: 'ORDER_UPDATED' } }), 2);
    });
  }

  await t.test('Precio unitario exacto en creación y edición, con cálculo decimal', async () => {
    const order = { proveedorId: supplier.id, porcentajeImpuestos: 21, descuentos: 0.01,
      items: [line(first, 100, 10.1234), line(second, 1, 10.1)] };
    const created = await request('SYSTEM_ADMIN', 'POST', '', order);
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.items.map((item) => item.precioUnitario), ['10.1234', '10.1']);
    const edited = await request('BUYER', 'PATCH', '/' + created.body.id, {
      ...order, items: [line(first, 100, parseUnitPrice('12,3456'))],
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.estado, 'BORRADOR');
    assert.equal(edited.body.items[0].precioUnitario, '12.3456');
    assert.equal(edited.body.subtotal, '1234.56');
    assert.equal(edited.body.impuestos, '259.2576');
    assert.equal(edited.body.total, '1493.8076');
    assert.match(formatMoney(edited.body.total, 'ARS'), /1\.493,81$/);
    const invalid = { ...order, items: [line(first, 1, '10.12345')] };
    assert.equal((await request('SYSTEM_ADMIN', 'POST', '', invalid)).status, 400);
    assert.equal((await request('BUYER', 'PATCH', '/' + created.body.id, invalid)).status, 400);
    const stored = await request('BUYER', 'GET', '/' + created.body.id);
    assert.equal(stored.body.items[0].precioUnitario, '12.3456');
  });

  await t.test('Reportes filtran por proveedor, mes local y ambos, con totales separados por moneda', async () => {
    const fixtures = [
      [supplier.id, '2026-10-01T03:00:00Z', 'ARS', 'BORRADOR'],
      [supplier.id, '2026-11-01T02:59:59Z', 'ARS', 'ENVIADA'],
      [supplier.id, '2026-11-01T03:00:00Z', 'ARS', 'APROBADA'],
      [otherSupplier.id, '2026-10-10T12:00:00Z', 'ARS', 'APROBADA'],
      [supplier.id, '2026-10-10T12:00:00Z', 'USD', 'APROBADA'],
      [supplier.id, '2026-10-10T12:00:00Z', 'ARS', 'CANCELADA'],
    ];
    const ids = [];
    for (const [proveedorId, fecha, moneda, estado] of fixtures) {
      const order = await request('SYSTEM_ADMIN', 'POST', '', {
        proveedorId, moneda, porcentajeImpuestos: 0, items: [line(first, 1, '10.1234')],
      });
      assert.equal(order.status, 201);
      ids.push(order.body.id);
      await prisma.purchaseOrder.update({ where: { id: order.body.id }, data: { fechaEmision: new Date(fecha), estado } });
    }

    async function report(role, query) {
      const response = await fetch(url + '/api/reports/purchases?' + query, {
        headers: { Authorization: 'Bearer ' + signToken(users[role]) },
      });
      return { status: response.status, body: await response.json() };
    }
    const provider = 'proveedorId=' + supplier.id;
    const bySupplier = await report('SYSTEM_ADMIN', provider);
    assert.equal(bySupplier.status, 200);
    assert.ok(bySupplier.body.monthly.every((group) => group.proveedor.id === supplier.id));
    assert.ok(bySupplier.body.monthly.some((group) => group.month === '2026-11'));
    const byMonth = await report('SYSTEM_ADMIN', 'mes=2026-10');
    assert.equal(byMonth.status, 200);
    assert.deepEqual(byMonth.body.monthly.flatMap((group) => group.orders.map((order) => order.id)).sort(), [ids[0], ids[1], ids[3], ids[4]].sort());
    const combined = await report('SYSTEM_ADMIN', provider + '&mes=2026-10');
    assert.equal(combined.status, 200);
    const groups = Object.fromEntries(combined.body.monthly.map((group) => [group.moneda, group]));
    assert.deepEqual(groups.ARS.orders.map((order) => order.id), [ids[1], ids[0]]);
    assert.equal(groups.ARS.total, '20.2468');
    assert.equal(groups.USD.total, '10.1234');
    assert.equal(groups.ARS.orders[0].items[0].precioUnitario, '10.1234');
    assert.equal((await report('SYSTEM_ADMIN', 'mes=2026-13')).status, 400);
    const blocked = await report('REQUESTER', provider + '&mes=2026-10');
    assert.equal(blocked.status, 403);
    assert.deepEqual(Object.keys(blocked.body), ['error']);
  });
});

test('El formulario admite coma o punto y presenta precios con cuatro decimales y totales con dos', () => {
  for (const [input, expected] of [['10', '10'], ['10,5', '10.5'], ['10,55', '10.55'], ['10,555', '10.555'], ['10,5555', '10.5555'], ['10.1', '10.1']]) {
    assert.equal(parseUnitPrice(input), expected);
  }
  assert.equal(parseUnitPrice('10,12345'), null);
  assert.equal(unitPriceInput('12.3456'), '12,3456');
  assert.equal(unitPriceInput('10.1'), '10,1000');
  assert.match(formatMoney('12.3456', 'ARS', 4), /12,3456$/);
  assert.match(formatMoney('1234.5600', 'ARS'), /1\.234,56$/);
  assert.match(formatMoney('12.3', 'JPY'), /12,30$/);
});
