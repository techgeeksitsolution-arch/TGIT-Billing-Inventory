import { prisma, getActiveFinancialYear, getOrCreateOrgAndUser } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, roundTo2 } from "../lib/utils.js";

export async function getNextPurchaseNumber(organizationId) {
  const fy = await getActiveFinancialYear(organizationId);
  const profile = await prisma.companyProfile.findUnique({ where: { organizationId } });
  const prefix = profile?.purchasePrefix || "TGIT/P";
  const seq = await prisma.documentSequence.upsert({
    where: {
      organizationId_sequenceType_financialYear: { organizationId, sequenceType: "PURCHASE", financialYear: fy },
    },
    update: { lastNumber: { increment: 1 } },
    create: { organizationId, sequenceType: "PURCHASE", financialYear: fy, prefix, lastNumber: 1 },
  });
  if (seq.prefix !== prefix) {
    await prisma.documentSequence.update({ where: { id: seq.id }, data: { prefix } });
  }
  const num = String(seq.lastNumber).padStart(3, "0");
  return `${prefix}/${num}/${fy}`;
}

async function resolveItem(input, taxMode) {
  let taxRatePercent = 0;
  let hsnCode = input.hsnCode || "";
  let description = input.description || "";
  let productId = input.productId || null;

  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
    if (!description) description = product.name;
    if (!hsnCode) hsnCode = product.hsnCode || "";
    if (product.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: product.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  }

  const item = {
    productId,
    description,
    hsnCode,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
  };
  const calc = calculateItemTax(
    { quantity: input.quantity, unitRate: input.unitPrice },
    taxMode,
    taxRatePercent
  );
  return {
    ...item,
    ...calc,
  };
}

export async function listPurchases(organizationId, { page = 1, limit = 20, status, search } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { internalNumber: { contains: search, mode: "insensitive" } },
      { supplierInvoiceNo: { contains: search, mode: "insensitive" } },
      { supplier: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchaseInvoice.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getPurchase(id, organizationId) {
  return prisma.purchaseInvoice.findFirst({
    where: { id, organizationId },
    include: {
      supplier: true,
      items: { include: { product: true } },
      createdBy: { select: { id: true, displayName: true } },
      confirmedBy: { select: { id: true, displayName: true } },
    },
  });
}

export async function createPurchase(organizationId, data) {
  const { user } = await getOrCreateOrgAndUser();
  const internalNumber = await getNextPurchaseNumber(organizationId);
  const taxMode = data.taxMode || "NON_GST";

  const processed = [];
  for (const it of data.items) processed.push(await resolveItem(it, taxMode));
  const totals = calculateInvoiceTotals(processed, taxMode);

  return prisma.purchaseInvoice.create({
    data: {
      organizationId,
      internalNumber,
      supplierInvoiceNo: data.supplierInvoiceNo || "",
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      supplierId: data.supplierId,
      taxMode,
      placeOfSupply: data.placeOfSupply || null,
      source: "MANUAL",
      ...totals,
      status: "DRAFT",
      createdById: user.id,
      items: { create: processed },
    },
    include: { supplier: true, items: { include: { product: true } } },
  });
}

export async function updatePurchase(id, organizationId, data) {
  const existing = await prisma.purchaseInvoice.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft purchases can be edited"), { statusCode: 400 });

  const taxMode = data.taxMode || existing.taxMode;
  if (data.items) {
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
    const processed = [];
    for (const it of data.items) processed.push(await resolveItem(it, taxMode));
    const totals = calculateInvoiceTotals(processed, taxMode);
    await prisma.purchaseInvoice.update({
      where: { id },
      data: {
        ...totals,
        supplierId: data.supplierId || existing.supplierId,
        supplierInvoiceNo: data.supplierInvoiceNo !== undefined ? data.supplierInvoiceNo : existing.supplierInvoiceNo,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
        taxMode,
        placeOfSupply: data.placeOfSupply !== undefined ? data.placeOfSupply : existing.placeOfSupply,
        items: { create: processed },
      },
    });
  } else {
    const updateData = {};
    if (data.supplierId) updateData.supplierId = data.supplierId;
    if (data.supplierInvoiceNo !== undefined) updateData.supplierInvoiceNo = data.supplierInvoiceNo;
    if (data.invoiceDate) updateData.invoiceDate = new Date(data.invoiceDate);
    if (data.taxMode) updateData.taxMode = data.taxMode;
    if (data.placeOfSupply !== undefined) updateData.placeOfSupply = data.placeOfSupply;
    if (Object.keys(updateData).length) await prisma.purchaseInvoice.update({ where: { id }, data: updateData });
  }
  return getPurchase(id, organizationId);
}

export async function finalizePurchase(id, organizationId) {
  const existing = await prisma.purchaseInvoice.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft purchases can be finalized"), { statusCode: 400 });

  const { user } = await getOrCreateOrgAndUser();
  const orgId = existing.organizationId;

  return prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      const stockBefore = Number(product.currentStock);
      const qty = Number(item.quantity);
      const stockAfter = roundTo2(stockBefore + qty);
      await tx.product.update({ where: { id: item.productId }, data: { currentStock: stockAfter } });
      await tx.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: item.productId,
          movementType: "PURCHASE_IN",
          referenceType: "PURCHASE_INVOICE",
          referenceId: id,
          quantityIn: qty,
          quantityOut: 0,
          stockBefore,
          stockAfter,
          notes: `Purchase: ${existing.internalNumber}`,
          createdById: user.id,
        },
      });
    }
    return tx.purchaseInvoice.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedById: user.id },
      include: { supplier: true, items: { include: { product: true } } },
    });
  });
}

export async function cancelPurchase(id, organizationId) {
  const existing = await prisma.purchaseInvoice.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  if (existing.status !== "CONFIRMED") throw Object.assign(new Error("Only finalized purchases can be cancelled"), { statusCode: 400 });

  const { user } = await getOrCreateOrgAndUser();
  const orgId = existing.organizationId;

  return prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      const stockBefore = Number(product.currentStock);
      const qty = Number(item.quantity);
      const stockAfter = roundTo2(stockBefore - qty);
      await tx.product.update({ where: { id: item.productId }, data: { currentStock: stockAfter } });
      await tx.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: item.productId,
          movementType: "PURCHASE_CANCEL_REVERSE",
          referenceType: "PURCHASE_INVOICE",
          referenceId: id,
          quantityIn: 0,
          quantityOut: qty,
          stockBefore,
          stockAfter,
          notes: `Cancel reversal: ${existing.internalNumber}`,
          createdById: user.id,
        },
      });
    }
    return tx.purchaseInvoice.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { supplier: true, items: { include: { product: true } } },
    });
  });
}
