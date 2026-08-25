import { prisma, getActiveFinancialYear } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, pickTotals } from "../lib/utils.js";

export async function getNextQuotationNumber(organizationId) {
  const fy = await getActiveFinancialYear(organizationId);
  const profile = await prisma.companyProfile.findUnique({ where: { organizationId } });
  const prefix = profile?.quotationPrefix || "TGIT/QUOT";
  const seq = await prisma.documentSequence.upsert({
    where: {
      organizationId_sequenceType_financialYear: {
        organizationId,
        sequenceType: "QUOTATION",
        financialYear: fy,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      organizationId,
      sequenceType: "QUOTATION",
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

async function resolveItemTax(item, taxMode) {
  const { resolveItemTax: salesResolve } = await import("./salesService.js");
  return salesResolve(item, taxMode);
}

export async function listQuotations(organizationId, { page = 1, limit = 20, status, search } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { quotationNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.quotation.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getQuotation(id, organizationId) {
  return prisma.quotation.findFirst({
    where: { id, organizationId },
    include: {
      items: { include: { product: true, service: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
}

export async function createQuotation(organizationId, data) {
  const { org, user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  const orgId = org.id;
  const quotationNumber = await getNextQuotationNumber(orgId);

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);

  const processedItems = [];
  for (const item of data.items) {
    processedItems.push(await resolveItemTax(item, data.taxMode || "NON_GST"));
  }
  const totals = calculateInvoiceTotals(processedItems, data.taxMode || "NON_GST");

  return prisma.quotation.create({
    data: {
      organizationId: orgId,
      quotationNumber,
      quotationDate: data.quotationDate ? new Date(data.quotationDate) : new Date(),
      validUntil: data.validUntil ? new Date(data.validUntil) : validUntil,
      customerId: data.customerId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || null,
      customerAddress: data.customerAddress || null,
      workOrderNo: data.workOrderNo || null,
      taxMode: data.taxMode || "NON_GST",
      placeOfSupply: data.placeOfSupply || null,
      notes: data.notes || null,
      ...pickTotals(totals),
      status: "DRAFT",
      createdById: user.id,
      items: { create: processedItems },
    },
    include: { customer: true, items: true },
  });
}

export async function updateQuotation(id, organizationId, data) {
  const existing = await prisma.quotation.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft quotations can be edited"), { statusCode: 400 });

  if (data.items) {
    await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
    const processedItems = [];
    for (const item of data.items) {
      processedItems.push(await resolveItemTax(item, data.taxMode || existing.taxMode));
    }
    for (const pi of processedItems) {
      await prisma.quotationItem.create({ data: { ...pi, quotationId: id } });
    }
    const totals = calculateInvoiceTotals(processedItems, data.taxMode || existing.taxMode);
    const updatePayload = {
      ...pickTotals(totals),
      taxMode: data.taxMode || existing.taxMode,
      customerName: data.customerName !== undefined ? data.customerName : existing.customerName,
    };
    if (data.customerId !== undefined) updatePayload.customerId = data.customerId;
    if (data.customerPhone !== undefined) updatePayload.customerPhone = data.customerPhone;
    if (data.customerAddress !== undefined) updatePayload.customerAddress = data.customerAddress;
    if (data.workOrderNo !== undefined) updatePayload.workOrderNo = data.workOrderNo || null;
    if (data.validUntil) updatePayload.validUntil = new Date(data.validUntil);
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.placeOfSupply !== undefined) updatePayload.placeOfSupply = data.placeOfSupply;
    if (data.quotationDate) updatePayload.quotationDate = new Date(data.quotationDate);
    await prisma.quotation.update({ where: { id }, data: updatePayload });
  } else {
    const updateData = {};
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
    if (data.customerAddress !== undefined) updateData.customerAddress = data.customerAddress;
    if (data.taxMode) updateData.taxMode = data.taxMode;
    if (data.placeOfSupply !== undefined) updateData.placeOfSupply = data.placeOfSupply;
    if (data.quotationDate) updateData.quotationDate = new Date(data.quotationDate);
    if (data.validUntil) updateData.validUntil = new Date(data.validUntil);
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (Object.keys(updateData).length > 0) await prisma.quotation.update({ where: { id }, data: updateData });
  }

  return getQuotation(id, organizationId);
}

export async function convertQuotationToSales(id, organizationId, { invoiceDate, invoiceNumberMode, invoiceNumber } = {}) {
  const existing = await prisma.quotation.findFirst({
    where: { id, organizationId },
    include: { items: { include: { product: true, service: true } } },
  });
  if (!existing) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });
  if (existing.status === "CANCELLED") throw Object.assign(new Error("Cancelled quotation cannot be converted"), { statusCode: 400 });
  if (existing.convertedInvoiceId) throw Object.assign(new Error("This quotation has already been converted"), { statusCode: 400 });

  const { createSalesInvoice } = await import("./salesService.js");

  const toNum = (v) => (v && typeof v === "object" && typeof v.toNumber === "function" ? v.toNumber() : Number(v));

  const effectiveDate = invoiceDate || (existing.quotationDate ? existing.quotationDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

  const salesPayload = {
    customerId: existing.customerId || undefined,
    invoiceDate: effectiveDate,
    taxMode: existing.taxMode,
    placeOfSupply: existing.placeOfSupply || undefined,
    workOrderNo: existing.workOrderNo || undefined,
    quotationReference: existing.quotationNumber,
    invoiceNumberMode: invoiceNumberMode || "AUTO",
    invoiceNumber: invoiceNumber || undefined,
    items: existing.items.map((i) => ({
      productId: i.productId || undefined,
      serviceId: i.serviceId || undefined,
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: toNum(i.quantity),
      unitRate: toNum(i.unitRate),
      taxRate: Number(i.cgstRate) * 2 || Number(i.igstRate) || undefined,
    })),
  };

  const salesInvoice = await createSalesInvoice(organizationId, salesPayload);

  await prisma.quotation.update({
    where: { id },
    data: {
      convertedInvoiceId: salesInvoice.id,
      convertedInvoiceNumber: salesInvoice.invoiceNumber,
      convertedAt: new Date(),
    },
  });

  return { salesInvoice, quotation: existing };
}

export async function finalizeQuotation(id, organizationId) {
  const existing = await prisma.quotation.findFirst({ where: { id, organizationId } });
  if (!existing) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft quotations can be finalized"), { statusCode: 400 });

  const { user } = await (await import("../db.js")).getOrCreateOrgAndUser();
  return prisma.quotation.update({
    where: { id },
    data: { status: "CONFIRMED", finalizedById: user.id },
    include: { customer: true, items: true },
  });
}

export async function cancelQuotation(id, organizationId) {
  const existing = await prisma.quotation.findFirst({ where: { id, organizationId } });
  if (!existing) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });
  if (existing.status === "CANCELLED") throw Object.assign(new Error("Quotation is already cancelled"), { statusCode: 400 });

  return prisma.quotation.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: { customer: true, items: true },
  });
}
