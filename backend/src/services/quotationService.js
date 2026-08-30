import { prisma, getActiveFinancialYear } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, pickTotals, getFinancialYearFromDate } from "../lib/utils.js";

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
  // 1. Quotation exists
  if (!existing) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });
  // 2. Quotation is eligible for conversion (must be confirmed; not cancelled)
  if (existing.status === "CANCELLED") throw Object.assign(new Error("Cancelled quotation cannot be converted"), { statusCode: 400 });
  if (existing.status !== "CONFIRMED") throw Object.assign(new Error("Quotation must be confirmed before conversion"), { statusCode: 400 });
  // 9 (duplicate conversion protection)
  if (existing.convertedInvoiceId) throw Object.assign(new Error(`Quotation already converted to Sales Invoice ${existing.convertedInvoiceNumber}`), { statusCode: 400 });

  const { createSalesInvoice } = await import("./salesService.js");

  const toNum = (v) => (v && typeof v === "object" && typeof v.toNumber === "function" ? v.toNumber() : Number(v));

  // 3. Customer exists
  if (!existing.customerId) throw Object.assign(new Error("Quotation has no customer; cannot create a Sales Invoice"), { statusCode: 400 });
  // 9. Valid line items
  if (!existing.items || existing.items.length === 0) throw Object.assign(new Error("Quotation has no line items; cannot create a Sales Invoice"), { statusCode: 400 });

  // 5. Invoice Date is valid (mandatory)
  const dateValue = invoiceDate ? new Date(invoiceDate) : null;
  if (!dateValue || isNaN(dateValue.getTime())) {
    throw Object.assign(new Error("Invoice Date is required."), { statusCode: 400 });
  }
  const effectiveDate = dateValue.toISOString().split("T")[0];

  // 6. Invoice Number Mode is selected
  const mode = invoiceNumberMode ? String(invoiceNumberMode).toUpperCase() : "";
  if (mode !== "AUTO" && mode !== "MANUAL") {
    throw Object.assign(new Error("Invoice Number Mode is required."), { statusCode: 400 });
  }

  // 4. If Manual -> number present + unique
  let normalizedManualNumber;
  if (mode === "MANUAL") {
    normalizedManualNumber = String(invoiceNumber || "").trim();
    if (!normalizedManualNumber) {
      throw Object.assign(new Error("Invoice Number is required in manual mode."), { statusCode: 400 });
    }
    const dup = await prisma.salesInvoice.findFirst({
      where: { organizationId, invoiceNumber: normalizedManualNumber },
    });
    if (dup) {
      throw Object.assign(new Error(`Invoice number "${normalizedManualNumber}" already exists.`), { statusCode: 400 });
    }
  }

  // 6/8. Financial Year consistency: invoice date must fall within the active Financial Year
  const activeFY = await getActiveFinancialYear(organizationId);
  const dateFY = getFinancialYearFromDate(dateValue);
  if (dateFY !== activeFY) {
    throw Object.assign(
      new Error(
        `Invoice Date (${effectiveDate}) falls outside the active Financial Year (${activeFY}). ` +
          `Select a date within the active FY or update the Financial Year in Settings.`
      ),
      { statusCode: 400 }
    );
  }
  if (mode === "MANUAL") {
    const m = normalizedManualNumber.match(/^(.*)\/(\d+)\/(.*)$/);
    if (m && m[3] !== activeFY) {
      throw Object.assign(
        new Error(`Invoice number financial year (${m[3]}) does not match the active Financial Year (${activeFY}).`),
        { statusCode: 400 }
      );
    }
  }

  const salesPayload = {
    customerId: existing.customerId,
    invoiceDate: effectiveDate,
    taxMode: existing.taxMode,
    placeOfSupply: existing.placeOfSupply || undefined,
    workOrderNo: existing.workOrderNo || null,
    quotationReference: existing.quotationNumber,
    invoiceNumberMode: mode,
    invoiceNumber: mode === "MANUAL" ? normalizedManualNumber : undefined,
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

/**
 * Deletes a quotation.
 *
 * A quotation is a commercial offer, not a statutory document, and it never
 * moves stock, so any status may be removed. The one exception is a quotation
 * that has already been converted into a sales invoice: deleting it would
 * orphan the link recorded on the invoice.
 */
export async function deleteQuotation(id, organizationId) {
  const existing = await prisma.quotation.findFirst({
    where: { id, organizationId },
    select: { id: true, quotationNumber: true, convertedInvoiceId: true, convertedInvoiceNumber: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Quotation not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  if (existing.convertedInvoiceId) {
    throw Object.assign(
      new Error(`Quotation ${existing.quotationNumber} was converted to invoice ${existing.convertedInvoiceNumber || existing.convertedInvoiceId} and cannot be deleted.`),
      { statusCode: 400, code: "DELETE_NOT_ALLOWED" },
    );
  }

  await prisma.quotation.delete({ where: { id } }); // items cascade
  return { id, quotationNumber: existing.quotationNumber, deleted: true };
}
