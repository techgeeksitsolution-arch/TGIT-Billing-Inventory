import { prisma, getActiveFinancialYear, getOrCreateOrgAndUser } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, roundTo2 } from "../lib/utils.js";

function statusError(message, statusCode = 400, code) {
  const err = Object.assign(new Error(message), { statusCode });
  if (code) err.code = code;
  return err;
}

export async function getNextSalesNumber(organizationId) {
  const fy = await getActiveFinancialYear(organizationId);
  const profile = await prisma.companyProfile.findUnique({ where: { organizationId } });
  const prefix = profile?.salesPrefix || "TGIT";
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
      prefix,
      lastNumber: 1,
    },
  });
  if (seq.prefix !== prefix) {
    await prisma.documentSequence.update({ where: { id: seq.id }, data: { prefix } });
  }
  const num = String(seq.lastNumber).padStart(3, "0");
  return `${prefix}/${num}/${fy}`;
}

export async function resolveItemTax(item, taxMode) {
  let taxRatePercent = item.taxRate != null ? Number(item.taxRate) : 0;
  let hsnSac = item.hsnSac || "";
  let description = item.description || "";

  if (item.productId) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
    if (!description) description = product.name;
    if (!hsnSac) hsnSac = product.hsnCode || "";
    if (taxRatePercent === 0 && product.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: product.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  } else if (item.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: item.serviceId } });
    if (!service) throw Object.assign(new Error("Service not found"), { statusCode: 400 });
    if (!description) description = service.name;
    if (!hsnSac) hsnSac = service.sacCode || "";
    if (taxRatePercent === 0 && service.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: service.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  }

  const calculated = calculateItemTax(item, taxMode, taxRatePercent);
  return {
    productId: item.productId || null,
    serviceId: item.serviceId || null,
    description,
    uom: item.uom || "Nos",
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
  const { org, user } = await getOrCreateOrgAndUser();
  const orgId = org.id;
  const taxMode = data.taxMode || "NON_GST";
  const roundOffMode = data.roundOffMode || "NEAREST";
  const discount = Number(data.discount) || 0;
  const otherCharges = Number(data.otherCharges) || 0;

  let invoiceNumber;
  const mode = (data.invoiceNumberMode || "AUTO").toUpperCase();
  if (mode === "MANUAL") {
    invoiceNumber = String(data.invoiceNumber || "").trim();
    if (!invoiceNumber) throw statusError("Invoice number is required in manual mode", 400, "MISSING_INVOICE_NUMBER");
    const dup = await prisma.salesInvoice.findFirst({ where: { organizationId: orgId, invoiceNumber } });
    if (dup) throw statusError(`Invoice number "${invoiceNumber}" already exists`, 400, "DUPLICATE_INVOICE_NUMBER");
    const m = invoiceNumber.match(/^(.*)\/(\d+)\/(.*)$/);
    if (m) {
      const prefix = m[1];
      const num = parseInt(m[2], 10);
      const fy = m[3];
      const existingSeq = await prisma.documentSequence.findUnique({
        where: { organizationId_sequenceType_financialYear: { organizationId: orgId, sequenceType: "SALES", financialYear: fy } },
      });
      const nextNum = existingSeq ? Math.max(existingSeq.lastNumber, num) : num;
      await prisma.documentSequence.upsert({
        where: {
          organizationId_sequenceType_financialYear: { organizationId: orgId, sequenceType: "SALES", financialYear: fy },
        },
        update: { prefix, lastNumber: nextNum },
        create: { organizationId: orgId, sequenceType: "SALES", financialYear: fy, prefix, lastNumber: num },
      });
    }
  } else {
    invoiceNumber = await getNextSalesNumber(orgId);
  }

  const processedItems = [];
  for (const item of data.items) {
    processedItems.push(await resolveItemTax(item, taxMode));
  }
  const totals = calculateInvoiceTotals(processedItems, taxMode, roundOffMode, { discount, otherCharges });

  try {
    return await prisma.salesInvoice.create({
      data: {
        organizationId: orgId,
        invoiceNumber,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
        customerId: data.customerId,
        taxMode,
        placeOfSupply: data.placeOfSupply || null,
        workOrderNo: data.workOrderNo || null,
        quotationReference: data.quotationReference || null,
        discount,
        otherCharges,
        roundOffMode,
        taxableTotal: totals.taxableTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        status: "DRAFT",
        createdById: user.id,
        items: { create: processedItems },
      },
      include: { customer: true, items: true },
    });
  } catch (e) {
    if (e.code === "P2002") throw statusError(`Invoice number "${invoiceNumber}" already exists`, 400, "DUPLICATE_INVOICE_NUMBER");
    throw e;
  }
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
    const taxMode = data.taxMode || existing.taxMode;
    const roundOffMode = data.roundOffMode || existing.roundOffMode || "NEAREST";
    const discount = data.discount !== undefined ? Number(data.discount) || 0 : Number(existing.discount) || 0;
    const otherCharges = data.otherCharges !== undefined ? Number(data.otherCharges) || 0 : Number(existing.otherCharges) || 0;
    const processedItems = [];
    for (const item of data.items) {
      processedItems.push(await resolveItemTax(item, taxMode));
    }
    for (const pi of processedItems) {
      await prisma.salesItem.create({ data: { ...pi, salesId: id } });
    }
    const totals = calculateInvoiceTotals(processedItems, taxMode, roundOffMode, { discount, otherCharges });
    const invoiceUpdate = {
      taxableTotal: totals.taxableTotal,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      igstTotal: totals.igstTotal,
      totalTax: totals.totalTax,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      discount,
      otherCharges,
      roundOffMode,
      customerId: data.customerId || existing.customerId,
      taxMode,
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
    if (data.discount !== undefined) updateData.discount = Number(data.discount) || 0;
    if (data.otherCharges !== undefined) updateData.otherCharges = Number(data.otherCharges) || 0;
    if (data.roundOffMode) updateData.roundOffMode = data.roundOffMode;
    if (Object.keys(updateData).length > 0) await prisma.salesInvoice.update({ where: { id }, data: updateData });
  }

  return getSalesInvoice(id, organizationId);
}

export async function finalizeSalesInvoice(id, organizationId, opts = {}) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Invoice not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft invoices can be finalized"), { statusCode: 400 });

  const { org, user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  const orgId = org.id;

  const stockWarnings = await checkStockAvailability(existing.items);
  if (stockWarnings.length > 0 && !opts.stockOverride) {
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

      const movementNotes = opts.stockOverride
        ? `Sale (override): Invoice ${existing.invoiceNumber} — ${opts.overrideReason || "No reason"}`
        : `Sale: Invoice ${existing.invoiceNumber}`;

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
          notes: movementNotes,
          createdById: user.id,
        },
      });
    }

    const updateData = { status: "CONFIRMED", finalizedById: user.id };
    if (opts.stockOverride) {
      updateData.stockOverride = true;
      updateData.stockOverrideReason = opts.overrideReason || null;
      updateData.stockOverrideData = opts.stockOverrideData ? JSON.stringify(opts.stockOverrideData) : null;
      updateData.stockOverrideUserId = user.id;
      updateData.stockOverrideTimestamp = new Date();
    }

    return tx.salesInvoice.update({
      where: { id },
      data: updateData,
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
