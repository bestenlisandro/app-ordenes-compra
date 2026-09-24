-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECIBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'REQUESTER', 'APPROVER', 'BUYER', 'RECEIVER', 'FINANCE', 'VENDOR');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL,
    "costCenter" TEXT,
    "approvalLimit" DECIMAL(65,30),
    "supplierId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" SERIAL NOT NULL,
    "delegatorId" INTEGER NOT NULL,
    "delegateId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "razonSocial" TEXT,
    "tiempoEntrega" INTEGER,
    "direccion" TEXT,
    "ciudad" TEXT,
    "provincia" TEXT,
    "pais" TEXT,
    "numero" TEXT,
    "piso" TEXT,
    "codigoPostal" TEXT,
    "condicionIva" TEXT,
    "sitioWeb" TEXT,
    "horarioAtencion" TEXT,
    "condicionPago" TEXT,
    "moneda" TEXT DEFAULT 'ARS',
    "listaPrecios" TEXT,
    "descuentoVolumen" TEXT,
    "costoEnvio" TEXT,
    "calificacion" INTEGER,
    "notasInternas" TEXT,
    "categoriaProductos" TEXT,
    "archivos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "marca" TEXT,
    "categoria" TEXT,
    "familia" TEXT,
    "subfamilia" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "unidadMedida" TEXT,
    "unidadCompra" TEXT,
    "factorConversion" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "codigoQr" TEXT,
    "puntoPedido" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "precioUnitario" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockActual" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stockMaximo" DECIMAL(65,30),
    "ubicacion" TEXT,
    "costoEstandar" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "iva" DECIMAL(65,30) NOT NULL DEFAULT 21,
    "atributosTecnicos" TEXT,
    "documentacionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItem" (
    "id" SERIAL NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "nombreProveedor" TEXT,
    "codigoProveedor" TEXT,
    "marcaProveedor" TEXT,
    "esPreferido" BOOLEAN NOT NULL DEFAULT false,
    "tiempoEntrega" INTEGER,
    "loteMinimo" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "precioSinIva" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "precioConIva" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "fechaActualizacionCosto" TIMESTAMP(3),

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL(65,30) NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "numeroOrden" TEXT NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "requestedById" INTEGER,
    "costCenter" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntregaEsperada" TIMESTAMP(3),
    "estado" "OrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "impuestos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "porcentajeImpuestos" DECIMAL(65,30) NOT NULL DEFAULT 21,
    "descuentos" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "lugarEntrega" TEXT,
    "proveedorRazonSocial" TEXT,
    "proveedorTaxId" TEXT,
    "proveedorContacto" TEXT,
    "proveedorDireccion" TEXT,
    "proveedorDatosContacto" TEXT,
    "condicionesPago" TEXT,
    "metodoEnvio" TEXT,
    "direccionFacturacion" TEXT,
    "autorizadoPor" TEXT,
    "firmaAutorizacion" TEXT,
    "terminosCondiciones" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(65,30) NOT NULL,
    "precioUnitario" DECIMAL(65,30) NOT NULL,
    "subtotalLinea" DECIMAL(65,30) NOT NULL,
    "codigoProveedor" TEXT,
    "nombreProveedor" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_taxId_key" ON "Supplier"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_codigo_key" ON "Item"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItem_proveedorId_productoId_key" ON "SupplierItem"("proveedorId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_numeroOrden_key" ON "PurchaseOrder"("numeroOrden");

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_delegatorId_fkey" FOREIGN KEY ("delegatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
