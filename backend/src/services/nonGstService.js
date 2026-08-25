import { prisma, getActiveFinancialYear, getOrCreateOrgAndUser } from "../db.js";
import { applyRoundOff, roundTo2 } from "../lib/utils.js";

export async function getNextNonGstNumber(organizationId) {
  const fy = await getActiveFinancialYear(organizationId);
  const profile = await prisma.companyProfile.findUnique({ where: { organizationId } });
  const prefix = profile?.nonGstPrefix || "TGIT/NG";
  const seq = await prisma.documentSequence.upsert({
    where: {
      organizationId_sequenceType_financialYear: {
        organizationId,
        sequenceType: "NON_GST",
        financialYear: fy,
      },
    },
    update: { lastNumber: { increment: 1 } },
    create: {
      organizationId,
      sequenceType: "NON_GST",
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

function computeTotals(items, { discount = 0, otherCharges = 0, roundOffMode = "NEAREST" } = {}) {
  const disc = Number(discount) || 0;
  const oth = Number(otherCharges) || 0;
  let taxableTotal = 0;
  for (const item of items) {
    taxableTotal += Number(item.totalPrice);
  }
  taxableTotal = roundTo2(taxableTotal);
  const calculatedTotal = roundTo2(taxableTotal + oth - disc);
  const { grandTotal, roundOff } = applyRoundOff(calculatedTotal, roundOffMode);
  return {
    taxableTotal,
    discount: disc,
    otherCharges: oth,
    calculatedTotal,
    roundOff,
    grandTotal,
  };
}

export async function listNonGstBills(organizationId, { page = 1, limit = 20, status, search } = {}) {
  const where = { organizationId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { billNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.nonGstBill.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.nonGstBill.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getNonGstBill(id, organizationId) {
  return prisma.nonGstBill.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      items: { include: { product: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });
}

function buildBillItems(data) {
  return (data.items || []).map((item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    const totalPrice = roundTo2(price * quantity);
    return {
      productId: item.productId || null,
      description: item.description || "",
      price,
      quantity,
      totalPrice,
    };
  });
}

export async function createNonGstBill(organizationId, data) {
  const { org, user } = await getOrCreateOrgAndUser();
  const orgId = org.id;
  const billNumber = await getNextNonGstNumber(orgId);
  const roundOffMode = data.roundOffMode || "NEAREST";
  const discount = Number(data.discount) || 0;
  const otherCharges = Number(data.otherCharges) || 0;

  const items = buildBillItems(data);
  const totals = computeTotals(items, { discount, otherCharges, roundOffMode });

  return prisma.nonGstBill.create({
    data: {
      organizationId: orgId,
      billNumber,
      billDate: data.billDate ? new Date(data.billDate) : new Date(),
      customerId: data.customerId || null,
      customerName: data.customerName || "",
      customerPhone: data.customerPhone || null,
      customerAddress: data.customerAddress || null,
      paymentMode: data.paymentMode || null,
      notes: data.notes || null,
      roundOffMode,
      taxableTotal: totals.taxableTotal,
      discount: totals.discount,
      otherCharges: totals.otherCharges,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      status: "DRAFT",
      createdById: user.id,
      items: { create: items },
    },
    include: { customer: true, items: true },
  });
}

export async function updateNonGstBill(id, organizationId, data) {
  const existing = await prisma.nonGstBill.findFirst({
    where: { id, organizationId },
    include: { items: true },
  });
  if (!existing) throw Object.assign(new Error("Bill not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft bills can be edited"), { statusCode: 400 });

  const roundOffMode = data.roundOffMode || existing.roundOffMode || "NEAREST";
  const discount = data.discount !== undefined ? Number(data.discount) || 0 : Number(existing.discount) || 0;
  const otherCharges = data.otherCharges !== undefined ? Number(data.otherCharges) || 0 : Number(existing.otherCharges) || 0;

  if (data.items) {
    await prisma.nonGstBillItem.deleteMany({ where: { billId: id } });
    const items = buildBillItems(data);
    const totals = computeTotals(items, { discount, otherCharges, roundOffMode });
    await prisma.nonGstBill.update({
      where: { id },
      data: {
        taxableTotal: totals.taxableTotal,
        discount: totals.discount,
        otherCharges: totals.otherCharges,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        roundOffMode,
        customerId: data.customerId !== undefined ? data.customerId || null : existing.customerId,
        customerName: data.customerName !== undefined ? data.customerName : existing.customerName,
        customerPhone: data.customerPhone !== undefined ? data.customerPhone : existing.customerPhone,
        customerAddress: data.customerAddress !== undefined ? data.customerAddress : existing.customerAddress,
        paymentMode: data.paymentMode !== undefined ? data.paymentMode : existing.paymentMode,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        billDate: data.billDate ? new Date(data.billDate) : existing.billDate,
      },
    });
    for (const it of items) {
      await prisma.nonGstBillItem.create({ data: { ...it, billId: id } });
    }
  } else {
    const updateData = {};
    if (data.customerId !== undefined) updateData.customerId = data.customerId || null;
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
    if (data.customerAddress !== undefined) updateData.customerAddress = data.customerAddress;
    if (data.paymentMode !== undefined) updateData.paymentMode = data.paymentMode;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.billDate) updateData.billDate = new Date(data.billDate);
    if (data.discount !== undefined) updateData.discount = discount;
    if (data.otherCharges !== undefined) updateData.otherCharges = otherCharges;
    if (data.roundOffMode) updateData.roundOffMode = roundOffMode;
    if (Object.keys(updateData).length > 0) await prisma.nonGstBill.update({ where: { id }, data: updateData });
  }

  return getNonGstBill(id, organizationId);
}

export async function finalizeNonGstBill(id, organizationId) {
  const existing = await prisma.nonGstBill.findFirst({ where: { id, organizationId } });
  if (!existing) throw Object.assign(new Error("Bill not found"), { statusCode: 404 });
  if (existing.status !== "DRAFT") throw Object.assign(new Error("Only draft bills can be finalized"), { statusCode: 400 });
  return prisma.nonGstBill.update({
    where: { id },
    data: { status: "CONFIRMED" },
    include: { customer: true, items: true },
  });
}

export async function cancelNonGstBill(id, organizationId) {
  const existing = await prisma.nonGstBill.findFirst({ where: { id, organizationId } });
  if (!existing) throw Object.assign(new Error("Bill not found"), { statusCode: 404 });
  if (existing.status !== "CONFIRMED") throw Object.assign(new Error("Only confirmed bills can be cancelled"), { statusCode: 400 });
  return prisma.nonGstBill.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: { customer: true, items: true },
  });
}
