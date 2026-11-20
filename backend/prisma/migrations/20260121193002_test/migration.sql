-- CreateTable
CREATE TABLE "TestTable" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,

    CONSTRAINT "TestTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestTable_reference_key" ON "TestTable"("reference");

-- CreateIndex
CREATE INDEX "TestTable_merchant_id_idx" ON "TestTable"("merchant_id");

-- CreateIndex
CREATE INDEX "TestTable_reference_idx" ON "TestTable"("reference");
