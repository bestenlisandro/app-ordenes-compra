import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

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
});
