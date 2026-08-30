import { prisma, getActiveFinancialYear, getOrCreateOrgAndUser } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, pickTotals, roundTo2 } from "../lib/utils.js";

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
  let taxRatePercent = input.taxRate != null ? Number(input.taxRate) : 0;
  let hsnCode = input.hsnCode || "";
  let description = input.description || "";
  let productId = input.productId || null;

  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
    if (!description) description = product.name;
    if (!hsnCode) hsnCode = product.hsnCode || "";
    if (taxRatePercent === 0 && product.taxRateId) {
      const tr = await prisma.taxRate.findUnique({ where: { id: product.taxRateId } });
      if (tr) taxRatePercent = Number(tr.rate);
    }
  }

  const qty = Number(input.quantity);
  const unitPrice = Number(input.unitPrice);
  const discount = Number(input.discount) || 0;
  const taxableValue = roundTo2(qty * unitPrice - discount);
  const calc = calculateItemTax({ quantity: qty, unitRate: unitPrice, taxableValue }, taxMode, taxRatePercent);
  return {
    productId,
    description,
    hsnCode,
    quantity: input.quantity,
    unitPrice,
    discount,
    uom: input.uom || "Nos",
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
      payments: true,
      attachments: true,
      createdBy: { select: { id: true, displayName: true } },
      confirmedBy: { select: { id: true, displayName: true } },
    },
  });
}

async function buildPurchaseData(organizationId, data, existing) {
  const taxMode = data.taxMode || (existing ? existing.taxMode : "NON_GST");
  const roundOffMode = data.roundOffMode || (existing ? existing.roundOffMode : "NEAREST") || "NEAREST";
  const processed = [];
  for (const it of data.items) processed.push(await resolveItem(it, taxMode));
  const totals = calculateInvoiceTotals(processed, taxMode, roundOffMode, { otherCharges: Number(data.otherCharges) || 0, discount: 0 });
  const totalDiscount = roundTo2(processed.reduce((s, i) => s + Number(i.discount || 0), 0));
  return {
    taxMode,
    roundOffMode,
    processed,
    totals,
    totalDiscount,
    otherCharges: Number(data.otherCharges) || 0,
  };
}

export async function createPurchase(organizationId, data) {
  const { user } = await getOrCreateOrgAndUser();
  const internalNumber = await getNextPurchaseNumber(organizationId);
  const { taxMode, roundOffMode, processed, totals, totalDiscount, otherCharges } = await buildPurchaseData(organizationId, data);

  const purchaseData = {
    organizationId,
    internalNumber,
    supplierInvoiceNo: data.supplierInvoiceNo || "",
    invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
    supplierId: data.supplierId,
    taxMode,
    placeOfSupply: data.placeOfSupply || null,
    source: data.source || "MANUAL",
    roundOffMode,
    reverseCharge: Boolean(data.reverseCharge),
    poNo: data.poNo || null,
    poDate: data.poDate ? new Date(data.poDate) : null,
    challanNo: data.challanNo || null,
    challanDate: data.challanDate ? new Date(data.challanDate) : null,
    lrNo: data.lrNo || null,
    ewayBillNo: data.ewayBillNo || null,
    deliveryMode: data.deliveryMode || null,
    discount: totalDiscount,
    otherCharges,
    paymentMode: data.paymentMode || null,
    ...pickTotals(totals),
    status: "DRAFT",
    createdById: user.id,
    items: { create: processed },
  };
  const purchase = await prisma.purchaseInvoice.create({
    data: purchaseData,
    include: { supplier: true, items: { include: { product: true } } },
  });

  if (Array.isArray(data.payments) && data.payments.length) {
    for (const p of data.payments) {
      await prisma.purchasePayment.create({
        data: {
          organizationId,
          purchaseId: purchase.id,
          amount: Number(p.amount) || 0,
          paymentDate: p.date ? new Date(p.date) : new Date(),
          mode: p.mode || "Cash",
          reference: p.reference || null,
          note: p.note || null,
          createdById: user.id,
        },
      });
    }
    await recomputePayment(purchase.id);
  } else {
    await prisma.purchaseInvoice.update({ where: { id: purchase.id }, data: { paymentStatus: "UNPAID", paidAmount: 0, dueAmount: Number(purchase.grandTotal) } });
  }
  return getPurchase(purchase.id, organizationId);
}

export async function updatePurchase(id, organizationId, data) {
  const existing = await prisma.purchaseInvoice.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft purchases can be edited"), { statusCode: 400 });

  const taxMode = data.taxMode || existing.taxMode;
  if (data.items) {
    const { roundOffMode, processed, totals, totalDiscount, otherCharges } = await buildPurchaseData(organizationId, data, existing);
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await prisma.purchaseInvoice.update({
      where: { id },
      data: {
        taxMode,
        roundOffMode,
        reverseCharge: data.reverseCharge !== undefined ? Boolean(data.reverseCharge) : existing.reverseCharge,
        supplierId: data.supplierId || existing.supplierId,
        supplierInvoiceNo: data.supplierInvoiceNo !== undefined ? data.supplierInvoiceNo : existing.supplierInvoiceNo,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
        placeOfSupply: data.placeOfSupply !== undefined ? data.placeOfSupply : existing.placeOfSupply,
        poNo: data.poNo !== undefined ? data.poNo : existing.poNo,
        poDate: data.poDate !== undefined ? (data.poDate ? new Date(data.poDate) : null) : existing.poDate,
        challanNo: data.challanNo !== undefined ? data.challanNo : existing.challanNo,
        challanDate: data.challanDate !== undefined ? (data.challanDate ? new Date(data.challanDate) : null) : existing.challanDate,
        lrNo: data.lrNo !== undefined ? data.lrNo : existing.lrNo,
        ewayBillNo: data.ewayBillNo !== undefined ? data.ewayBillNo : existing.ewayBillNo,
        deliveryMode: data.deliveryMode !== undefined ? data.deliveryMode : existing.deliveryMode,
        discount: totalDiscount,
        otherCharges,
        paymentMode: data.paymentMode !== undefined ? data.paymentMode : existing.paymentMode,
        ...pickTotals(totals),
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
    if (data.reverseCharge !== undefined) updateData.reverseCharge = Boolean(data.reverseCharge);
    if (data.poNo !== undefined) updateData.poNo = data.poNo;
    if (data.poDate !== undefined) updateData.poDate = data.poDate ? new Date(data.poDate) : null;
    if (data.challanNo !== undefined) updateData.challanNo = data.challanNo;
    if (data.challanDate !== undefined) updateData.challanDate = data.challanDate ? new Date(data.challanDate) : null;
    if (data.lrNo !== undefined) updateData.lrNo = data.lrNo;
    if (data.ewayBillNo !== undefined) updateData.ewayBillNo = data.ewayBillNo;
    if (data.deliveryMode !== undefined) updateData.deliveryMode = data.deliveryMode;
    if (data.paymentMode !== undefined) updateData.paymentMode = data.paymentMode;
    if (data.otherCharges !== undefined) updateData.otherCharges = Number(data.otherCharges) || 0;
    if (Object.keys(updateData).length) await prisma.purchaseInvoice.update({ where: { id }, data: updateData });
  }
  return getPurchase(id, organizationId);
}

export async function finalizePurchase(id, organizationId, opts = {}) {
  const existing = await prisma.purchaseInvoice.findFirst({ where: { id, organizationId }, include: { items: true } });
  if (!existing) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft purchases can be finalized"), { statusCode: 400 });

  const { user } = await getOrCreateOrgAndUser();
  const orgId = existing.organizationId;
  const updatePurchaseRate = Boolean(opts.updatePurchaseRate);

  return prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      const stockBefore = Number(product.currentStock);
      const qty = Number(item.quantity);
      const stockAfter = roundTo2(stockBefore + qty);
      await tx.product.update({ where: { id: item.productId }, data: { currentStock: stockAfter } });
      if (updatePurchaseRate) {
        await tx.product.update({ where: { id: item.productId }, data: { purchasePrice: roundTo2(Number(item.unitPrice)) } });
      }
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
          unitCost: roundTo2(Number(item.unitPrice)),
          notes: `Purchase: ${existing.internalNumber}`,
          createdById: user.id,
        },
      });
    }
    return tx.purchaseInvoice.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedById: user.id },
      include: { supplier: true, items: { include: { product: true } }, payments: true },
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
      include: { supplier: true, items: { include: { product: true } }, payments: true },
    });
  });
}

export async function recomputePayment(purchaseId) {
  const p = await prisma.purchaseInvoice.findUnique({ where: { id: purchaseId }, include: { payments: true } });
  if (!p) return;
  const paid = roundTo2(p.payments.reduce((s, x) => s + Number(x.amount), 0));
  const grand = Number(p.grandTotal);
  const due = roundTo2(grand - paid);
  let status = "UNPAID";
  if (grand > 0 && paid >= grand) status = "PAID";
  else if (paid > 0) status = "PARTIALLY_PAID";
  await prisma.purchaseInvoice.update({ where: { id: purchaseId }, data: { paidAmount: paid, dueAmount: due, paymentStatus: status } });
}

export async function addPurchasePayment(organizationId, purchaseId, data) {
  const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: purchaseId, organizationId } });
  if (!purchase) throw Object.assign(new Error("Purchase not found"), { statusCode: 404 });
  const { user } = await getOrCreateOrgAndUser();
  const payment = await prisma.purchasePayment.create({
    data: {
      organizationId,
      purchaseId,
      amount: Number(data.amount) || 0,
      paymentDate: data.date ? new Date(data.date) : new Date(),
      mode: data.mode || "Cash",
      reference: data.reference || null,
      note: data.note || null,
      createdById: user.id,
    },
  });
  await recomputePayment(purchaseId);
  return payment;
}

export async function listPurchasePayments(organizationId, purchaseId) {
  return prisma.purchasePayment.findMany({
    where: { purchaseId, organizationId },
    orderBy: { paymentDate: "desc" },
  });
}

export async function deletePurchasePayment(organizationId, paymentId) {
  const payment = await prisma.purchasePayment.findFirst({ where: { id: paymentId, organizationId } });
  if (!payment) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
  await prisma.purchasePayment.delete({ where: { id: paymentId } });
  await recomputePayment(payment.purchaseId);
  return { ok: true };
}
