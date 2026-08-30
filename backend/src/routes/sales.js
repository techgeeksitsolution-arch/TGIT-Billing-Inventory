import { Router } from "express";
import { listSalesInvoices, getSalesInvoice, createSalesInvoice, updateSalesInvoice, finalizeSalesInvoice, cancelSalesInvoice, deleteSalesInvoice, checkStockAvailability } from "../services/salesService.js";
import { prisma, getOrCreateOrgAndUser } from "../db.js";
import { uploadExcel } from "../lib/upload.js";
import {
  readRowsFromBuffer, buildTemplateBuffer, buildSalesExportBuffer, validateSalesImport, createSalesFromGroups, importBatches, randomUUID, SALES_HEADERS,
} from "../lib/importExport.js";

export const salesRouter = Router();

salesRouter.get("/check-number", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const number = String(req.query.number || "").trim();
    if (!number) return res.json({ exists: false });
    const existing = await prisma.salesInvoice.findFirst({
      where: { organizationId: org.id, invoiceNumber: number },
    });
    res.json({ exists: !!existing });
  } catch (e) {
    next(e);
  }
});

salesRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await listSalesInvoices(org.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
      search: req.query.search || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

salesRouter.get("/stock-check", async (req, res, next) => {
  try {
    const items = JSON.parse(req.query.items || "[]");
    const warnings = await checkStockAvailability(items);
    res.json({ warnings });
  } catch (e) { next(e); }
});

salesRouter.get("/template", async (req, res, next) => {
  try {
    const buf = await buildTemplateBuffer(SALES_HEADERS, [
      { "Invoice No": "", Date: "24/08/2026", "Customer Name": "Sample Customer", "Customer GSTIN": "", "Tax Mode": "INTRA_STATE_GST", "HSN/SAC": "8471", Description: "Sample Product", Quantity: 1, Rate: 1000, "Tax %": 18, "Work Order No": "" },
    ]);
    res.setHeader("Content-Disposition", 'attachment; filename="sales_import_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e) { next(e); }
});

salesRouter.get("/export", async (req, res, next) => {
  try {
    const buf = await buildSalesExportBuffer();
    res.setHeader("Content-Disposition", 'attachment; filename="sales_export.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e) { next(e); }
});

salesRouter.post("/import", uploadExcel, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: "NO_FILE", message: "Excel file required" } });
    const rows = await readRowsFromBuffer(req.file.buffer, req.file.originalname);
    const { rows: detailed, hasErrors, groups } = await validateSalesImport(rows);
    const batchId = randomUUID();
    importBatches.set(batchId, { hasErrors, groups });
    setTimeout(() => importBatches.delete(batchId), 30 * 60 * 1000);
    res.json({ batchId, hasErrors, totalRows: detailed.length, validGroups: groups.length, rows: detailed });
  } catch (e) { next(e); }
});

salesRouter.post("/import/confirm", async (req, res, next) => {
  try {
    const { batchId } = req.body;
    const batch = importBatches.get(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch expired or invalid" } });
    if (batch.hasErrors) return res.status(400).json({ error: { code: "HAS_ERRORS", message: "Fix validation errors before importing" } });
    const created = await createSalesFromGroups(batch.groups);
    importBatches.delete(batchId);
    res.json({ created: created.length, invoices: created.map((i) => i.invoiceNumber) });
  } catch (e) { next(e); }
});

salesRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await getSalesInvoice(req.params.id, org.id);
    if (!invoice) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice not found" } });
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.post("/", async (req, res, next) => {
  try {
    // A GST Sales Invoice must never be created as Non-GST; that belongs to the
    // separate Non-GST Bill module. Applied here on the interactive create route
    // only, so the Excel import path and historical records are unaffected.
    if (req.body?.taxMode === "NON_GST") {
      return res.status(400).json({
        error: {
          code: "INVALID_TAX_MODE",
          message: "A GST Sales Invoice cannot use Non-GST tax mode. Use the Non-GST Bill module instead.",
        },
      });
    }
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await createSalesInvoice(org.id, req.body);
    res.status(201).json(invoice);
  } catch (e) { next(e); }
});

salesRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await updateSalesInvoice(req.params.id, org.id, req.body);
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.post("/:id/finalize", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const opts = {};
    if (req.body.stockOverride) {
      opts.stockOverride = true;
      opts.overrideReason = req.body.overrideReason || null;
      opts.stockOverrideData = req.body.stockOverrideData || null;
    }
    const invoice = await finalizeSalesInvoice(req.params.id, org.id, opts);
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.delete("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await deleteSalesInvoice(req.params.id, org.id);
    res.json(result);
  } catch (e) { next(e); }
});

salesRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await cancelSalesInvoice(req.params.id, org.id);
    res.json(invoice);
  } catch (e) { next(e); }
});
