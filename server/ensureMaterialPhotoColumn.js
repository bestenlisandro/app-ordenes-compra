require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  if (process.env.DATABASE_PURPOSE !== 'compras') {
    throw new Error('Se canceló la actualización: DATABASE_PURPOSE debe ser "compras".');
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "foto" TEXT');
    console.log('Esquema de fotos de materiales verificado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
