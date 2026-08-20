const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../server/auth');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({ where: { username: 'admin' }, update: {}, create: { username: 'admin', nombre: 'Administrador del Sistema', email: 'admin@besten.local', role: 'SYSTEM_ADMIN', passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'Compras2026!') } });
  await prisma.supplier.upsert({ where: { taxId: '30-12345678-9' }, update: {}, create: { nombre: 'Distribuidora Central', razonSocial: 'Distribuidora Central S.A.', taxId: '30-12345678-9', contacto: 'María González', email: 'ventas@central.test', telefono: '+54 11 5555-0100', tiempoEntrega: 5, direccion: 'Av. Siempre Viva 123', ciudad: 'Buenos Aires', provincia: 'Buenos Aires', pais: 'Argentina' } });
  for (const item of [
    { codigo: 'INS-001', descripcion: 'Resma papel A4 80g', precioUnitario: 8500, stockActual: 24, stockMinimo: 10 },
    { codigo: 'INS-002', descripcion: 'Cartucho de tinta negro', precioUnitario: 22500, stockActual: 4, stockMinimo: 5 },
    { codigo: 'INS-003', descripcion: 'Bolígrafo azul', precioUnitario: 1200, stockActual: 120, stockMinimo: 30 },
  ]) await prisma.item.upsert({ where: { codigo: item.codigo }, update: {}, create: item });
}
main().then(() => console.log('Datos de ejemplo creados.')).catch(console.error).finally(() => prisma.$disconnect());
