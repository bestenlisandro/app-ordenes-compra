require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { ensureMaterialPhotoColumn } = require('./ensureMaterialPhotoColumn');

const prisma = new PrismaClient();
ensureMaterialPhotoColumn(prisma)
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
