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
  "HSN/SAC", "Description", "Quantity", "Unit Price", "Tax %",
];

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
    const date = parseDate(r["Date"]);
    if (!date) errors.push("Invalid or missing Date");
    const taxMode = normalizeTaxMode(r["Tax Mode"]);
    if (!taxMode || !TAX_MODES.includes(taxMode)) errors.push("Invalid Tax Mode");
    const qty = num(r["Quantity"]);
    if (qty == null || qty <= 0) errors.push("Quantity must be > 0");
    const price = num(r["Unit Price"]);
    if (price == null || price < 0) errors.push("Unit Price must be >= 0");
    const taxPctRaw = num(r["Tax %"]);
    if (taxPctRaw != null && (taxPctRaw < 0 || taxPctRaw > 100)) errors.push("Tax % must be 0-100");
    const supplierName = (r["Supplier Name"] || "").toString().trim();
    if (!supplierName) errors.push("Supplier Name required");

    let product = null;
    if (supplierName && date && taxMode) {
      product = await findProduct(org.id, r["HSN/SAC"], r["Description"]);
      if (!product) errors.push("Product not found (by HSN/SAC or Description)");
    }

    if (errors.length) hasErrors = true;

    let calc = null;
    let taxRatePercent = taxPctRaw != null ? taxPctRaw : (product?.taxRateId ? Number((await prisma.taxRate.findUnique({ where: { id: product.taxRateId } }))?.rate || 0) : 0);
    if (product && qty != null && price != null) {
      calc = calculateItemTax({ quantity: qty, unitRate: price }, taxMode, taxRatePercent);
    }

    const dateISO = date ? date.toISOString().slice(0, 10) : "";
    const key = groupKey(r["Supplier Invoice No"], dateISO, supplierName);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        supplierInvoiceNo: (r["Supplier Invoice No"] || "").toString().trim(),
        dateISO, date,
        taxMode,
        supplierName,
        supplierGstin: (r["Supplier GSTIN"] || "").toString().trim(),
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
        unitPrice: price,
        ...calc,
      });
    }

    out.push({
      row: r.__row,
      supplierInvoiceNo: (r["Supplier Invoice No"] || "").toString().trim(),
      date: dateISO,
      supplier: supplierName,
      description: (r["Description"] || "").toString().trim(),
      quantity: qty,
      unitPrice: price,
      taxMode,
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
        "HSN/SAC": it.hsnCode || "",
        Description: it.description,
        Quantity: Number(it.quantity),
        "Unit Price": Number(it.unitPrice),
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

export async function createPurchasesFromGroups(groups) {
  const { org, user } = await getOrCreateOrgAndUser();
  const created = [];
  for (const g of groups) {
    const supplier = await findOrCreateSupplier(org.id, g.supplierName, g.supplierGstin);
    const totals = calculateInvoiceTotals(g.items, g.taxMode);
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
        ...pickTotals(totals),
        status: "DRAFT",
        createdById: user.id,
        items: { create: g.items.map((it) => ({
          productId: it.productId, description: it.description, hsnCode: it.hsnCode, quantity: it.quantity, unitPrice: it.unitPrice,
          taxableValue: it.taxableValue, cgstRate: it.cgstRate, cgstAmount: it.cgstAmount, sgstRate: it.sgstRate, sgstAmount: it.sgstAmount, igstRate: it.igstRate, igstAmount: it.igstAmount, totalAmount: it.totalAmount,
        })) },
      },
      include: { items: true },
    });
    created.push(inv);
  }
  return created;
}

export { randomUUID };
