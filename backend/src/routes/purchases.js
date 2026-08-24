import { Router } from "express";
import {
  listPurchases, getPurchase, createPurchase, updatePurchase, finalizePurchase, cancelPurchase,
} from "../services/purchaseService.js";
import { getOrCreateOrgAndUser } from "../db.js";
import { uploadExcel } from "../lib/upload.js";
import {
  readRowsFromBuffer, buildTemplateBuffer, buildPurchaseExportBuffer, validatePurchaseImport, createPurchasesFromGroups, importBatches, randomUUID, PURCHASE_HEADERS,
} from "../lib/importExport.js";

export const purchasesRouter = Router();

purchasesRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await listPurchases(org.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
      search: req.query.search || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

purchasesRouter.get("/template", async (req, res, next) => {
  try {
    const buf = await buildTemplateBuffer(PURCHASE_HEADERS, [
      { "Supplier Invoice No": "SUP/001", Date: "24/08/2026", "Supplier Name": "Sample Supplier", "Supplier GSTIN": "", "Tax Mode": "INTRA_STATE_GST", "HSN/SAC": "4819", Description: "A4 Paper Ream", Quantity: 5, "Unit Price": 200, "Tax %": 12 },
    ]);
    res.setHeader("Content-Disposition", 'attachment; filename="purchase_import_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e) { next(e); }
});

purchasesRouter.get("/export", async (req, res, next) => {
  try {
    const buf = await buildPurchaseExportBuffer();
    res.setHeader("Content-Disposition", 'attachment; filename="purchase_export.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e) { next(e); }
});

purchasesRouter.post("/import", uploadExcel, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: "NO_FILE", message: "Excel file required" } });
    const rows = await readRowsFromBuffer(req.file.buffer, req.file.originalname);
    const { rows: detailed, hasErrors, groups } = await validatePurchaseImport(rows);
    const batchId = randomUUID();
    importBatches.set(batchId, { hasErrors, groups });
    setTimeout(() => importBatches.delete(batchId), 30 * 60 * 1000);
    res.json({ batchId, hasErrors, totalRows: detailed.length, validGroups: groups.length, rows: detailed });
  } catch (e) { next(e); }
});

purchasesRouter.post("/import/confirm", async (req, res, next) => {
  try {
    const { batchId } = req.body;
    const batch = importBatches.get(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch expired or invalid" } });
    if (batch.hasErrors) return res.status(400).json({ error: { code: "HAS_ERRORS", message: "Fix validation errors before importing" } });
    const created = await createPurchasesFromGroups(batch.groups);
    importBatches.delete(batchId);
    res.json({ created: created.length, invoices: created.map((i) => i.internalNumber) });
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await getPurchase(req.params.id, org.id);
    if (!purchase) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase not found" } });
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await createPurchase(org.id, req.body);
    res.status(201).json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await updatePurchase(req.params.id, org.id, req.body);
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/:id/finalize", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await finalizePurchase(req.params.id, org.id);
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await cancelPurchase(req.params.id, org.id);
    res.json(purchase);
  } catch (e) { next(e); }
});
