const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.supplier.upsert({ where: { taxId: '30-12345678-9' }, update: {}, create: { nombre: 'Distribuidora Central S.A.', taxId: '30-12345678-9', email: 'ventas@central.test', telefono: '+54 11 5555-0100', direccion: 'Av. Siempre Viva 123' } });
  for (const item of [
    { codigo: 'INS-001', descripcion: 'Resma papel A4 80g', precioUnitario: 8500, stockActual: 24, stockMinimo: 10 },
    { codigo: 'INS-002', descripcion: 'Cartucho de tinta negro', precioUnitario: 22500, stockActual: 4, stockMinimo: 5 },
    { codigo: 'INS-003', descripcion: 'Bolígrafo azul', precioUnitario: 1200, stockActual: 120, stockMinimo: 30 },
  ]) await prisma.item.upsert({ where: { codigo: item.codigo }, update: {}, create: item });
}
main().then(() => console.log('Datos de ejemplo creados.')).catch(console.error).finally(() => prisma.$disconnect());
