-- Additive migration: preserves all existing users, orders and items.
CREATE TYPE "RequestVisibleStatus" AS ENUM (
  'RECEIVED_REQUEST',
  'ORDERED_FROM_SUPPLIER',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "User"
  ADD COLUMN "canChooseSupplier" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canUseCatalogItem" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canUseFreeItem" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN "proveedorId" DROP NOT NULL,
  ADD COLUMN "requesterVisibleStatus" "RequestVisibleStatus" NOT NULL DEFAULT 'RECEIVED_REQUEST';

ALTER TABLE "OrderItem"
  ADD COLUMN "unidadSolicitada" TEXT;

CREATE TABLE "RequestStatusHistory" (
  "id" SERIAL NOT NULL,
  "purchaseOrderId" INTEGER NOT NULL,
  "status" "RequestVisibleStatus" NOT NULL,
  "message" TEXT,
  "changedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequestStatusHistory_purchaseOrderId_createdAt_idx"
  ON "RequestStatusHistory"("purchaseOrderId", "createdAt");

ALTER TABLE "RequestStatusHistory"
  ADD CONSTRAINT "RequestStatusHistory_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestStatusHistory"
  ADD CONSTRAINT "RequestStatusHistory_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Give existing orders a compatible requester-facing status and an initial,
-- non-economic history entry without changing their internal workflow status.
UPDATE "PurchaseOrder"
SET "requesterVisibleStatus" = CASE
  WHEN "estado" = 'RECIBIDA' THEN 'DELIVERED'::"RequestVisibleStatus"
  WHEN "estado" = 'CANCELADA' THEN 'CANCELLED'::"RequestVisibleStatus"
  WHEN "estado" IN ('ENVIADA', 'APROBADA') THEN 'ORDERED_FROM_SUPPLIER'::"RequestVisibleStatus"
  ELSE 'RECEIVED_REQUEST'::"RequestVisibleStatus"
END;

INSERT INTO "RequestStatusHistory" (
  "purchaseOrderId", "status", "message", "changedById", "createdAt"
)
SELECT
  order_row."id",
  order_row."requesterVisibleStatus",
  'Solicitud incorporada al seguimiento.',
  order_row."requestedById",
  order_row."createdAt"
FROM "PurchaseOrder" AS order_row
INNER JOIN "User" AS requester ON requester."id" = order_row."requestedById";
