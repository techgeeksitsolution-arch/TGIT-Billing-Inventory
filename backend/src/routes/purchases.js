import { Router } from "express";
import {
  listPurchases, getPurchase, createPurchase, updatePurchase, finalizePurchase, cancelPurchase,
  addPurchasePayment, listPurchasePayments, deletePurchasePayment, deletePurchaseInvoice,
} from "../services/purchaseService.js";
import { getOrCreateOrgAndUser, prisma } from "../db.js";
import { uploadExcel, uploadAny } from "../lib/upload.js";
import {
  readRowsFromBuffer, buildTemplateBuffer, buildPurchaseExportBuffer, validatePurchaseImport, createPurchasesFromGroups, importBatches, randomUUID, PURCHASE_HEADERS,
} from "../lib/importExport.js";

const OCR_CONFIG_KEY = "ocrProvider";

async function getOcrConfig(orgId) {
  const s = await prisma.setting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: OCR_CONFIG_KEY } } });
  return s?.value ? JSON.parse(s.value) : { provider: null, endpoint: null, model: null, enabled: false };
}

async function saveOcrConfig(orgId, cfg) {
  await prisma.setting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: OCR_CONFIG_KEY } },
    update: { value: JSON.stringify(cfg) },
    create: { organizationId: orgId, key: OCR_CONFIG_KEY, value: JSON.stringify(cfg) },
  });
}

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
      { "Supplier Invoice No": "SUP/001", Date: "24/08/2026", "Supplier Name": "Sample Supplier", "Supplier GSTIN": "", "Tax Mode": "INTRA_STATE_GST", "PO No": "", "Challan No": "", "LR No": "", "E-Way Bill No": "", "Reverse Charge": "No", "HSN/SAC": "4819", Description: "A4 Paper Ream", "Product SKU": "", "Qty": 5, "UOM": "Nos", "Unit Price": 200, "Discount": 0, "Tax %": 12 },
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
    const { batchId, productOverrides } = req.body;
    const batch = importBatches.get(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Batch expired or invalid" } });
    if (batch.hasErrors && !productOverrides) {
      return res.status(400).json({ error: { code: "HAS_ERRORS", message: "Fix validation errors or provide product overrides before importing" } });
    }
    const created = await createPurchasesFromGroups(batch.groups, productOverrides || {});
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
    const purchase = await finalizePurchase(req.params.id, org.id, { updatePurchaseRate: Boolean(req.body.updatePurchaseRate) });
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

// Attachments
purchasesRouter.post("/:id/attachments", uploadAny, async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    if (!req.file) return res.status(400).json({ error: { code: "NO_FILE", message: "File required" } });
    const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!purchase) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase not found" } });
    const att = await prisma.purchaseAttachment.create({
      data: {
        organizationId: org.id,
        purchaseId: purchase.id,
        storageKey: randomUUID(),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer.toString("base64"),
      },
    });
    res.status(201).json(att);
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id/attachments", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const attachments = await prisma.purchaseAttachment.findMany({ where: { purchaseId: req.params.id, organizationId: org.id }, orderBy: { createdAt: "desc" } });
    res.json(attachments);
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id/attachments/:attId/download", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const att = await prisma.purchaseAttachment.findFirst({ where: { id: req.params.attId, purchaseId: req.params.id, organizationId: org.id } });
    if (!att || !att.data) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
    const buf = Buffer.from(att.data, "base64");
    res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(att.fileName)}"`);
    res.send(buf);
  } catch (e) { next(e); }
});

purchasesRouter.delete("/:id/attachments/:attId", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const att = await prisma.purchaseAttachment.findFirst({ where: { id: req.params.attId, purchaseId: req.params.id, organizationId: org.id } });
    if (!att) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });
    await prisma.purchaseAttachment.delete({ where: { id: req.params.attId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Payments
purchasesRouter.post("/:id/payments", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const payment = await addPurchasePayment(org.id, req.params.id, req.body);
    res.status(201).json(payment);
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id/payments", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const payments = await listPurchasePayments(org.id, req.params.id);
    res.json(payments);
  } catch (e) { next(e); }
});

purchasesRouter.delete("/:id/payments/:paymentId", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await deletePurchasePayment(org.id, req.params.paymentId);
    res.json(result);
  } catch (e) { next(e); }
});

// OCR
purchasesRouter.post("/:id/ocr", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await prisma.purchaseInvoice.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!purchase) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase not found" } });
    const attachmentId = req.body.attachmentId;
    if (!attachmentId) return res.status(400).json({ error: { code: "NO_ATTACHMENT", message: "attachmentId required" } });
    const att = await prisma.purchaseAttachment.findFirst({ where: { id: attachmentId, purchaseId: purchase.id, organizationId: org.id } });
    if (!att) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found" } });

    const cfg = await getOcrConfig(org.id);
    const job = await prisma.ocrJob.create({
      data: { organizationId: org.id, purchaseId: purchase.id, provider: cfg.provider || "none", status: "PENDING" },
    });
    await prisma.purchaseAttachment.update({ where: { id: att.id }, data: { ocrJobId: job.id } });

    if (!cfg.enabled || !cfg.provider) {
      await prisma.ocrJob.update({ where: { id: job.id }, data: { status: "NOT_CONFIGURED", rawResult: { error: "OCR Not Configured" } } });
      return res.json({ ...job, status: "NOT_CONFIGURED", message: "OCR provider not configured" });
    }

    await prisma.ocrJob.update({ where: { id: job.id }, data: { status: "AWAITING_REVIEW", rawResult: { note: "OCR provider integration pending; enter data manually and apply." } } });
    res.json({ ...job, status: "AWAITING_REVIEW", message: "OCR provider integration pending; manual review available" });
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id/ocr", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const jobs = await prisma.ocrJob.findMany({ where: { purchaseId: req.params.id, organizationId: org.id }, orderBy: { createdAt: "desc" } });
    res.json(jobs);
  } catch (e) { next(e); }
});

purchasesRouter.get("/ocr/:jobId", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const job = await prisma.ocrJob.findFirst({ where: { id: req.params.jobId, organizationId: org.id } });
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found" } });
    res.json(job);
  } catch (e) { next(e); }
});

purchasesRouter.post("/ocr/:jobId/apply", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const job = await prisma.ocrJob.findFirst({ where: { id: req.params.jobId, organizationId: org.id } });
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found" } });
    const purchase = await createPurchase(org.id, { ...req.body, source: "OCR" });
    await prisma.ocrJob.update({ where: { id: job.id }, data: { status: "APPLIED", purchaseId: purchase.id, extracted: req.body, reviewedAt: new Date() } });
    res.status(201).json(purchase);
  } catch (e) { next(e); }
});

export { getOcrConfig, saveOcrConfig, OCR_CONFIG_KEY };

purchasesRouter.delete("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await deletePurchaseInvoice(req.params.id, org.id);
    res.json(result);
  } catch (e) { next(e); }
});
