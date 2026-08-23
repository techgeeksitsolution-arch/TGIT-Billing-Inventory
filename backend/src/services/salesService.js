import { prisma, getActiveFinancialYear } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, roundTo2 } from "../lib/utils.js";

export async function getNextSalesNumber(organizationId) {
  const fy = await getActiveFinancialYear(organizationId);
  const seq = await prisma.documentSequence.upsert({
    where: {
      organizationId_sequenceType_financialYear: {
        organizationId,
        sequenceType: "SALES",
        financialYear: fy,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      organizationId,
      sequenceType: "SALES",
      financialYear: fy,
      prefix: "TGIT",
      lastNumber: 1,
    },
  });
  const num = String(seq.lastNumber).padStart(3, "0");
  return `TGIT/${num}/${fy}`;
}

export async function resolveItemTax(item, taxMode) {
  let taxRatePercent = 0;
  let hsnSac = item.hsnSac || "";
  let description = item.description || "";

  if (item.productId) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
    if (!description) description = product.name;
    if (!hsnSac) hsnSac = product.hsnCode || "";
    if (product.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: product.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  } else if (item.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: item.serviceId } });
    if (!service) throw Object.assign(new Error("Service not found"), { statusCode: 400 });
    if (!description) description = service.name;
    if (!hsnSac) hsnSac = service.sacCode || "";
    if (service.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: service.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  }

  const calculated = calculateItemTax(item, taxMode, taxRatePercent);
  return {
    productId: item.productId || null,
    serviceId: item.serviceId || null,
    description,
    hsnSac,
    quantity: item.quantity,
    unitRate: item.unitRate,
    ...calculated,
  };
}

export async function checkStockAvailability(items) {
  const warnings = [];
  for (const item of items) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) {
      warnings.push({ productId: item.productId, message: "Product not found" });
      continue;
    }
    const available = Number(product.currentStock);
    const requested = Number(item.quantity);
    if (requested > available) {
      warnings.push({
        productId: item.productId,
        productName: product.name,
        available,
        requested,
        message: `Insufficient stock: ${product.name} (available: ${available}, requested: ${requested})`,
      });
    }
  }
  return warnings;
}

export async function listSalesInvoices(organizationId, { page = 1, limit = 20, status, search } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.salesInvoice.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getSalesInvoice(id, organizationId) {
  return prisma.salesInvoice.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      items: { include: { product: true, service: true } },
      createdBy: { select: { id: true, displayName: true } },
      finalizedBy: { select: { id: true, displayName: true } },
    },
  });
}

export async function createSalesInvoice(organizationId, data) {
  const { org, user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  const orgId = org.id;
  const invoiceNumber = await getNextSalesNumber(orgId);

  const processedItems = [];
  for (const item of data.items) {
    processedItems.push(await resolveItemTax(item, data.taxMode || "NON_GST"));
  }
  const totals = calculateInvoiceTotals(processedItems, data.taxMode || "NON_GST");

  return prisma.salesInvoice.create({
    data: {
      organizationId: orgId,
      invoiceNumber,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      customerId: data.customerId,
      taxMode: data.taxMode || "NON_GST",
      placeOfSupply: data.placeOfSupply || null,
      workOrderNo: data.workOrderNo || null,
      quotationReference: data.quotationReference || null,
      ...totals,
      status: "DRAFT",
      createdById: user.id,
      items: { create: processedItems },
    },
    include: { customer: true, items: true },
  });
}

export async function updateSalesInvoice(id, organizationId, data) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Invoice not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft invoices can be edited"), { statusCode: 400 });

  if (data.items) {
    await prisma.salesItem.deleteMany({ where: { salesId: id } });
    const processedItems = [];
    for (const item of data.items) {
      processedItems.push(await resolveItemTax(item, data.taxMode || existing.taxMode));
    }
    for (const pi of processedItems) {
      await prisma.salesItem.create({ data: { ...pi, salesId: id } });
    }
    const totals = calculateInvoiceTotals(processedItems, data.taxMode || existing.taxMode);
    const invoiceUpdate = {
      ...totals,
      customerId: data.customerId || existing.customerId,
      taxMode: data.taxMode || existing.taxMode,
      placeOfSupply: data.placeOfSupply !== undefined ? data.placeOfSupply : existing.placeOfSupply,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
    };
    if (data.workOrderNo !== undefined) invoiceUpdate.workOrderNo = data.workOrderNo || null;
    if (data.quotationReference !== undefined) invoiceUpdate.quotationReference = data.quotationReference || null;
    await prisma.salesInvoice.update({ where: { id }, data: invoiceUpdate });
  } else {
    const updateData = {};
    if (data.customerId) updateData.customerId = data.customerId;
    if (data.taxMode) updateData.taxMode = data.taxMode;
    if (data.placeOfSupply !== undefined) updateData.placeOfSupply = data.placeOfSupply;
    if (data.invoiceDate) updateData.invoiceDate = new Date(data.invoiceDate);
    if (data.workOrderNo !== undefined) updateData.workOrderNo = data.workOrderNo || null;
    if (data.quotationReference !== undefined) updateData.quotationReference = data.quotationReference || null;
    if (Object.keys(updateData).length > 0) await prisma.salesInvoice.update({ where: { id }, data: updateData });
  }

  return getSalesInvoice(id, organizationId);
}

export async function finalizeSalesInvoice(id, organizationId) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Invoice not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft invoices can be finalized"), { statusCode: 400 });

  const { org, user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  const orgId = org.id;

  const stockWarnings = await checkStockAvailability(existing.items);
  if (stockWarnings.length > 0) {
    const err = new Error("Insufficient stock for finalization");
    err.statusCode = 400;
    err.code = "INSUFFICIENT_STOCK";
    err.details = stockWarnings;
    throw err;
  }

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
          movementType: "SALE_OUT",
          referenceType: "SALES_INVOICE",
          referenceId: id,
          quantityIn: 0,
          quantityOut: qty,
          stockBefore,
          stockAfter,
          notes: `Sale: Invoice ${existing.invoiceNumber}`,
          createdById: user.id,
        },
      });
    }

    return tx.salesInvoice.update({
      where: { id },
      data: { status: "CONFIRMED", finalizedById: user.id },
      include: { customer: true, items: true },
    });
  });
}

export async function cancelSalesInvoice(id, organizationId) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Invoice not found"), { statusCode: 404 });
  if (existing.status !== "CONFIRMED") throw Object.assign(new Error("Only finalized invoices can be cancelled"), { statusCode: 400 });

  const { org, user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  const orgId = org.id;

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
          movementType: "SALE_CANCEL_REVERSE",
          referenceType: "SALES_INVOICE",
          referenceId: id,
          quantityIn: qty,
          quantityOut: 0,
          stockBefore,
          stockAfter,
          notes: `Cancel reversal: Invoice ${existing.invoiceNumber}`,
          createdById: user.id,
        },
      });
    }

    return tx.salesInvoice.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { customer: true, items: true },
    });
  });
}
