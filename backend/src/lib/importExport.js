import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { prisma, getOrCreateOrgAndUser } from "../db.js";
import { calculateItemTax, calculateInvoiceTotals, pickTotals, roundTo2 } from "../lib/utils.js";
import { getNextSalesNumber } from "../services/salesService.js";
import { getNextPurchaseNumber } from "../services/purchaseService.js";

export const importBatches = new Map();

export const SALES_HEADERS = [
  "Invoice No", "Date", "Customer Name", "Customer GSTIN", "Tax Mode",
  "HSN/SAC", "Description", "Quantity", "Rate", "Tax %", "Work Order No",
];

export const PURCHASE_HEADERS = [
  "Supplier Invoice No", "Date", "Supplier Name", "Supplier GSTIN", "Tax Mode",
  "PO No", "Challan No", "LR No", "E-Way Bill No", "Reverse Charge",
  "HSN/SAC", "Description", "Product SKU", "Qty", "UOM", "Unit Price", "Discount", "Tax %",
];

const PURCHASE_FIELD_ALIASES = {
  supplierInvoiceNo: ["Supplier Invoice No", "Voucher Number", "Bill No", "Invoice No", "Supplier Bill No", "Document No"],
  invoiceDate: ["Date", "Voucher Date", "Invoice Date", "Bill Date"],
  supplierName: ["Supplier Name", "Supplier Ledger Name", "Party Name", "Vendor Name"],
  supplierGstin: ["Supplier GSTIN", "GSTIN", "Supplier GST Number", "GST No", "Party GSTIN"],
  taxMode: ["Tax Mode", "GST Registration Type", "Registration Type"],
  hsn: ["HSN/SAC", "HSN CODE", "HSN Code", "HSN", "SAC"],
  description: ["Description", "Item Description", "Item", "Particulars", "Product Name"],
  quantity: ["Quantity", "QTY", "Qty"],
  uom: ["UOM", "Unit", "UoM"],
  unitPrice: ["Unit Price", "Price", "Rate", "Basic Rate"],
  discount: ["Discount", "Disc", "Line Discount"],
  taxPct: ["Tax %", "Tax Rate", "GST %", "GST Rate"],
  poNo: ["PO No", "PO Number", "P.O. No"],
  challanNo: ["Challan No", "Delivery Challan No", "DC No"],
  lrNo: ["LR No", "LR Number", "Transport Doc No", "Transport No"],
  ewayBillNo: ["E-Way Bill No", "Eway Bill No", "EWB No"],
  reverseCharge: ["Reverse Charge", "RCM"],
  igstAmount: ["IGST Amount", "IGST Amt", "IGST"],
  cgstAmount: ["CGST Amount", "CGST Amt", "CGST"],
  sgstAmount: ["SGST Amount", "SGST Amt", "SGST"],
  igstRate: ["IGST Rate"],
  cgstRate: ["CGST Rate"],
};

const ALIAS_LOOKUP = {};
for (const [field, aliases] of Object.entries(PURCHASE_FIELD_ALIASES)) {
  for (const a of aliases) ALIAS_LOOKUP[a.toLowerCase()] = field;
}

function normalizePurchaseRow(raw) {
  const out = {};
  for (const [header, value] of Object.entries(raw)) {
    const key = String(header).trim().toLowerCase();
    const field = ALIAS_LOOKUP[key];
    if (field && value !== undefined && value !== "") out[field] = value;
  }
  return out;
}

function detectTaxMode(row) {
  if (row.taxMode) {
    const tm = normalizeTaxMode(row.taxMode);
    if (tm) return tm;
  }
  const igst = num(row.igstAmount) || 0;
  const cgst = num(row.cgstAmount) || 0;
  if (igst > 0) return "INTER_STATE_GST";
  if (cgst > 0) return "INTRA_STATE_GST";
  return "NON_GST";
}

function deriveTaxPercent(row, taxMode) {
  if (row.taxPct != null) {
    const t = num(row.taxPct);
    if (t != null && t >= 0) return t;
  }
  if (taxMode === "INTER_STATE_GST") {
    const r = num(row.igstRate); if (r != null) return r;
  }
  if (taxMode === "INTRA_STATE_GST") {
    const r = num(row.cgstRate); if (r != null) return (r || 0) * 2;
  }
  return 0;
}

async function findProductByPriority(orgId, { hsn, name, sku }) {
  if (hsn) {
    const byHsn = await prisma.product.findFirst({ where: { organizationId: orgId, hsnCode: String(hsn).trim() } });
    if (byHsn) return { product: byHsn, confidence: "high", source: "hsn" };
  }
  if (sku) {
    const bySku = await prisma.product.findFirst({ where: { organizationId: orgId, sku: String(sku).trim() } });
    if (bySku) return { product: bySku, confidence: "high", source: "sku" };
  }
  if (name) {
    const clean = String(name).trim();
    const byName = await prisma.product.findFirst({ where: { organizationId: orgId, name: { equals: clean, mode: "insensitive" } } });
    if (byName) return { product: byName, confidence: "high", source: "name" };
    const fuzzy = await prisma.product.findFirst({ where: { organizationId: orgId, name: { contains: clean, mode: "insensitive" } } });
    if (fuzzy) return { product: fuzzy, confidence: "low", source: "fuzzy" };
  }
  return { product: null, confidence: null, source: null };
}

export async function readRowsFromBuffer(buffer, filename = "") {
  const wb = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(filename);
  if (isCsv) await wb.csv.load(buffer.toString("utf8"));
  else await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell((cell, col) => { headers[col] = (cell.value == null ? "" : String(cell.value)).trim(); });
  const rows = [];
  const last = ws.rowCount || 0;
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    if (row.cellCount === 0) continue;
    const obj = {};
    let empty = true;
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (!h) return;
      let v = cell.value;
      if (v && typeof v === "object" && "text" in v) v = v.text;
      else if (v && typeof v === "object" && "result" in v) v = v.result;
      if (typeof v === "string") v = v.trim();
      obj[h] = v;
      if (v !== "" && v != null) empty = false;
    });
    if (empty) continue;
    obj.__row = r;
    rows.push(obj);
  }
  return rows;
}

export async function buildWorkbook(headers, dataRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.columns = headers.map((h) => ({ header: h, key: h, width: 22 }));
  ws.getRow(1).font = { bold: true };
  ws.addRows(dataRows);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function parseDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return new Date((v - 25569) * 86400 * 1000);
    return null;
  }
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeTaxMode(v) {
  if (v == null || String(v).trim() === "") return "NON_GST";
  const s = String(v).toUpperCase();
  if (s === "NON_GST" || s === "NON GST") return "NON_GST";
  if (s === "EXEMPT") return "EXEMPT";
  if (s.includes("INTRA") || s.includes("CGST") || s === "GST") return "INTRA_STATE_GST";
  if (s.includes("INTER") || s.includes("IGST")) return "INTER_STATE_GST";
  return null;
}

const TAX_MODES = ["NON_GST", "INTRA_STATE_GST", "INTER_STATE_GST", "EXEMPT"];

async function findProduct(orgId, hsn, name) {
  if (hsn) {
    const byHsn = await prisma.product.findFirst({ where: { organizationId: orgId, hsnCode: String(hsn).trim() } });
    if (byHsn) return byHsn;
  }
  if (name) {
    const byName = await prisma.product.findFirst({ where: { organizationId: orgId, name: { equals: String(name).trim(), mode: "insensitive" } } });
    if (byName) return byName;
  }
  return null;
}

async function findOrCreateCustomer(orgId, name, gstin) {
  const clean = String(name).trim();
  let c = await prisma.customer.findFirst({ where: { organizationId: orgId, name: { equals: clean, mode: "insensitive" } } });
  if (!c) c = await prisma.customer.create({ data: { organizationId: orgId, name: clean, gstNumber: gstin ? String(gstin).trim() : null, isActive: true } });
  return c;
}

async function findOrCreateSupplier(orgId, name, gstin) {
  const clean = String(name).trim();
  let s = await prisma.supplier.findFirst({ where: { organizationId: orgId, name: { equals: clean, mode: "insensitive" } } });
  if (!s) s = await prisma.supplier.create({ data: { organizationId: orgId, name: clean, gstNumber: gstin ? String(gstin).trim() : null, isActive: true } });
  return s;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function groupKey(invNo, dateISO, party) {
  return `${invNo || "AUTO"}||${dateISO}||${party}`.toLowerCase();
}

export async function validateSalesImport(rows) {
  const { org } = await getOrCreateOrgAndUser();
  const out = [];
  const groupsMap = new Map();
  let hasErrors = false;

  for (const r of rows) {
    const errors = [];
    const date = parseDate(r["Date"]);
    if (!date) errors.push("Invalid or missing Date");
    const taxMode = normalizeTaxMode(r["Tax Mode"]);
    if (!taxMode || !TAX_MODES.includes(taxMode)) errors.push("Invalid Tax Mode");
    const qty = num(r["Quantity"]);
    if (qty == null || qty <= 0) errors.push("Quantity must be > 0");
    const rate = num(r["Rate"]);
    if (rate == null || rate < 0) errors.push("Rate must be >= 0");
    const taxPctRaw = num(r["Tax %"]);
    if (taxPctRaw != null && (taxPctRaw < 0 || taxPctRaw > 100)) errors.push("Tax % must be 0-100");
    const customerName = (r["Customer Name"] || "").toString().trim();
    if (!customerName) errors.push("Customer Name required");

    let product = null;
    if (customerName && date && taxMode) {
      product = await findProduct(org.id, r["HSN/SAC"], r["Description"]);
      if (!product) errors.push("Product not found (by HSN/SAC or Description)");
    }

    if (errors.length) hasErrors = true;

    let calc = null;
    let taxRatePercent = taxPctRaw != null ? taxPctRaw : (product?.taxRateId ? Number((await prisma.taxRate.findUnique({ where: { id: product.taxRateId } }))?.rate || 0) : 0);
    if (product && qty != null && rate != null) {
      calc = calculateItemTax({ quantity: qty, unitRate: rate }, taxMode, taxRatePercent);
    }

    const dateISO = date ? date.toISOString().slice(0, 10) : "";
    const key = groupKey(r["Invoice No"], dateISO, customerName);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        invoiceNo: (r["Invoice No"] || "").toString().trim(),
        dateISO, date,
        taxMode,
        customerName,
        customerGstin: (r["Customer GSTIN"] || "").toString().trim(),
        workOrderNo: (r["Work Order No"] || "").toString().trim(),
        items: [],
      });
    }
    const grp = groupsMap.get(key);
    if (calc) {
      grp.items.push({
        productId: product.id,
        description: (r["Description"] || product.name).toString().trim(),
        hsnCode: (r["HSN/SAC"] || product.hsnCode || "").toString().trim(),
        quantity: qty,
        unitPrice: rate,
        ...calc,
      });
    }

    out.push({
      row: r.__row,
      invoiceNo: (r["Invoice No"] || "").toString().trim(),
      date: dateISO,
      customer: customerName,
      description: (r["Description"] || "").toString().trim(),
      quantity: qty,
      rate,
      taxMode,
      errors,
    });
  }

  const groups = [...groupsMap.values()].filter((g) => g.items.length > 0);
  return { rows: out, hasErrors, groups };
}

export async function validatePurchaseImport(rows) {
  const { org } = await getOrCreateOrgAndUser();
  const out = [];
  const groupsMap = new Map();
  let hasErrors = false;

  for (const r of rows) {
    const errors = [];
    const n = normalizePurchaseRow(r);

    const voucherType = (r["Voucher Type"] || r["Type"] || "").toString().trim();
    if (voucherType && !/purchase/i.test(voucherType)) continue;

    const date = parseDate(n.invoiceDate);
    if (!date) errors.push("Invalid or missing Date");
    const taxMode = detectTaxMode(n);
    if (!TAX_MODES.includes(taxMode)) errors.push("Invalid Tax Mode");
    const qty = num(n.quantity);
    if (qty == null || qty <= 0) errors.push("Quantity must be > 0");
    const price = num(n.unitPrice);
    if (price == null || price < 0) errors.push("Unit Price must be >= 0");
    const taxPctRaw = deriveTaxPercent(n, taxMode);
    if (taxPctRaw != null && (taxPctRaw < 0 || taxPctRaw > 100)) errors.push("Tax % must be 0-100");
    const supplierName = (n.supplierName || "").toString().trim();
    if (!supplierName) errors.push("Supplier Name required");

    const match = supplierName && date && taxMode
      ? await findProductByPriority(org.id, { hsn: n.hsn, name: n.description, sku: n.sku })
      : { product: null, confidence: null };
    const product = match.product;
    const needsReview = !product || match.confidence !== "high";
    if (!product) errors.push(`Product not found (${match.source ? "suggestion: " + match.source : "no match"})`);

    if (errors.length) hasErrors = true;

    let calc = null;
    let taxRatePercent = taxPctRaw != null ? taxPctRaw : (product?.taxRateId ? Number((await prisma.taxRate.findUnique({ where: { id: product.taxRateId } }))?.rate || 0) : 0);
    if (product && qty != null && price != null) {
      const discount = num(n.discount) || 0;
      const taxableValue = roundTo2(qty * price - discount);
      calc = calculateItemTax({ quantity: qty, unitRate: price, taxableValue }, taxMode, taxRatePercent);
    }

    const dateISO = date ? date.toISOString().slice(0, 10) : "";
    const supplierInvoiceNo = (n.supplierInvoiceNo || "").toString().trim();
    const key = groupKey(supplierInvoiceNo, dateISO, supplierName);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        supplierInvoiceNo,
        dateISO, date,
        taxMode,
        supplierName,
        supplierGstin: (n.supplierGstin || "").toString().trim(),
        poNo: (n.poNo || "").toString().trim() || null,
        challanNo: (n.challanNo || "").toString().trim() || null,
        lrNo: (n.lrNo || "").toString().trim() || null,
        ewayBillNo: (n.ewayBillNo || "").toString().trim() || null,
        reverseCharge: /yes|y|true|1/i.test(String(n.reverseCharge || "")),
        items: [],
      });
    }
    const grp = groupsMap.get(key);
    grp.items.push({
      __row: r.__row,
      productId: product ? product.id : null,
      needsReview,
      description: (n.description || product?.name || "").toString().trim(),
      hsnCode: (n.hsn || product?.hsnCode || "").toString().trim(),
      quantity: qty,
      unitPrice: price,
      uom: (n.uom || "Nos").toString().trim(),
      discount: num(n.discount) || 0,
      ...(calc || {}),
    });

    out.push({
      row: r.__row,
      supplierInvoiceNo,
      date: dateISO,
      supplier: supplierName,
      description: (n.description || "").toString().trim(),
      quantity: qty,
      unitPrice: price,
      taxMode,
      productMatched: !!product,
      productName: product?.name || null,
      needsReview,
      errors,
    });
  }

  const groups = [...groupsMap.values()].filter((g) => g.items.length > 0);
  return { rows: out, hasErrors, groups };
}

export async function buildSalesExportBuffer() {
  const { org } = await getOrCreateOrgAndUser();
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId: org.id },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  const data = [];
  for (const inv of invoices) {
    for (const it of inv.items) {
      data.push({
        "Invoice No": inv.invoiceNumber,
        Date: new Date(inv.invoiceDate).toISOString().slice(0, 10),
        "Customer Name": inv.customer?.name || "Walk-in",
        "Customer GSTIN": inv.customer?.gstNumber || "",
        "Tax Mode": inv.taxMode,
        "HSN/SAC": it.hsnSac || "",
        Description: it.description,
        Quantity: Number(it.quantity),
        Rate: Number(it.unitRate),
        "Tax %": inv.taxMode === "INTRA_STATE_GST" ? Number(it.cgstRate) * 2 : inv.taxMode === "INTER_STATE_GST" ? Number(it.igstRate) : 0,
        "Work Order No": inv.workOrderNo || "",
      });
    }
  }
  return buildWorkbook(SALES_HEADERS, data);
}

export async function buildPurchaseExportBuffer() {
  const { org } = await getOrCreateOrgAndUser();
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { organizationId: org.id },
    include: { supplier: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  const data = [];
  for (const inv of invoices) {
    for (const it of inv.items) {
      data.push({
        "Supplier Invoice No": inv.supplierInvoiceNo || "",
        Date: new Date(inv.invoiceDate).toISOString().slice(0, 10),
        "Supplier Name": inv.supplier?.name || "",
        "Supplier GSTIN": inv.supplier?.gstNumber || "",
        "Tax Mode": inv.taxMode,
        "PO No": inv.poNo || "",
        "Challan No": inv.challanNo || "",
        "LR No": inv.lrNo || "",
        "E-Way Bill No": inv.ewayBillNo || "",
        "Reverse Charge": inv.reverseCharge ? "Yes" : "No",
        "HSN/SAC": it.hsnCode || "",
        Description: it.description,
        "Product SKU": it.product?.sku || "",
        "Qty": Number(it.quantity),
        "UOM": it.uom || "Nos",
        "Unit Price": Number(it.unitPrice),
        "Discount": Number(it.discount) || 0,
        "Tax %": inv.taxMode === "INTRA_STATE_GST" ? Number(it.cgstRate) * 2 : inv.taxMode === "INTER_STATE_GST" ? Number(it.igstRate) : 0,
      });
    }
  }
  return buildWorkbook(PURCHASE_HEADERS, data);
}

export function buildTemplateBuffer(headers, sample) {
  return buildWorkbook(headers, sample);
}

export async function createSalesFromGroups(groups) {
  const { org, user } = await getOrCreateOrgAndUser();
  const created = [];
  for (const g of groups) {
    const customer = await findOrCreateCustomer(org.id, g.customerName, g.customerGstin);
    const totals = calculateInvoiceTotals(g.items, g.taxMode);
    const invoiceNumber = g.invoiceNo || (await getNextSalesNumber(org.id));
    const inv = await prisma.salesInvoice.create({
      data: {
        organizationId: org.id,
        invoiceNumber,
        invoiceDate: g.date,
        customerId: customer.id,
        taxMode: g.taxMode,
        workOrderNo: g.workOrderNo || null,
        ...pickTotals(totals),
        status: "DRAFT",
        createdById: user.id,
        items: { create: g.items.map((it) => ({
          productId: it.productId, description: it.description, hsnSac: it.hsnCode || "", quantity: it.quantity, unitRate: it.unitPrice,
          taxableValue: it.taxableValue, cgstRate: it.cgstRate, cgstAmount: it.cgstAmount, sgstRate: it.sgstRate, sgstAmount: it.sgstAmount, igstRate: it.igstRate, igstAmount: it.igstAmount, totalAmount: it.totalAmount,
        })) },
      },
      include: { items: true },
    });
    created.push(inv);
  }
  return created;
}

export async function createPurchasesFromGroups(groups, productOverrides = {}) {
  const { org, user } = await getOrCreateOrgAndUser();
  const created = [];
  for (const g of groups) {
    const supplier = await findOrCreateSupplier(org.id, g.supplierName, g.supplierGstin);
    const items = g.items.map((it) => {
      const productId = it.productId || productOverrides[String(it.__row)] || productOverrides[it.__row];
      if (!productId) throw Object.assign(new Error(`Product not resolved for row ${it.__row} (${it.description})`), { statusCode: 400 });
      return { ...it, productId };
    });
    const totals = calculateInvoiceTotals(items, g.taxMode);
    const totalDiscount = roundTo2(items.reduce((s, i) => s + (Number(i.discount) || 0), 0));
    const internalNumber = await getNextPurchaseNumber(org.id);
    const inv = await prisma.purchaseInvoice.create({
      data: {
        organizationId: org.id,
        internalNumber,
        supplierInvoiceNo: g.supplierInvoiceNo || "",
        invoiceDate: g.date,
        supplierId: supplier.id,
        taxMode: g.taxMode,
        source: "EXCEL",
        roundOffMode: "NEAREST",
        reverseCharge: Boolean(g.reverseCharge),
        poNo: g.poNo || null,
        challanNo: g.challanNo || null,
        lrNo: g.lrNo || null,
        ewayBillNo: g.ewayBillNo || null,
        discount: totalDiscount,
        otherCharges: 0,
        ...pickTotals(totals),
        status: "DRAFT",
        createdById: user.id,
        items: { create: items.map((it) => ({
          productId: it.productId, description: it.description, hsnCode: it.hsnCode, quantity: it.quantity, unitPrice: it.unitPrice, discount: it.discount || 0, uom: it.uom || "Nos",
          taxableValue: it.taxableValue, cgstRate: it.cgstRate, cgstAmount: it.cgstAmount, sgstRate: it.sgstRate, sgstAmount: it.sgstAmount, igstRate: it.igstRate, igstAmount: it.igstAmount, totalAmount: it.totalAmount,
        })) },
      },
      include: { items: true },
    });
    await prisma.purchaseInvoice.update({ where: { id: inv.id }, data: { paymentStatus: "UNPAID", paidAmount: 0, dueAmount: Number(inv.grandTotal) } });
    created.push(inv);
  }
  return created;
}

export { randomUUID };
