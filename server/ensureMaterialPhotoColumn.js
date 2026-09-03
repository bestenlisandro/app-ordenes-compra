async function ensureMaterialPhotoColumn(prisma) {
  if (process.env.DATABASE_PURPOSE !== 'compras') {
    throw new Error('Se canceló la actualización: DATABASE_PURPOSE debe ser "compras".');
  }
  await prisma.$executeRawUnsafe('ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "foto" TEXT');
  console.log('Esquema de fotos de materiales verificado.');
}

module.exports = { ensureMaterialPhotoColumn };
