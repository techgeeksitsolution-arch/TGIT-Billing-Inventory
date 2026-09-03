import { Router } from "express";
import {
  listPurchases, getPurchase, createPurchase, updatePurchase, finalizePurchase, cancelPurchase,
  addPurchasePayment, listPurchasePayments, deletePurchasePayment, deletePurchaseInvoice,
  checkDuplicatePurchase,
} from "../services/purchaseService.js";
import { getOrCreateOrgAndUser, prisma } from "../db.js";
import { uploadExcel, uploadAny } from "../lib/upload.js";
import {
  readRowsFromBuffer, buildTemplateBuffer, buildPurchaseExportBuffer, validatePurchaseImport, createPurchasesFromGroups, importBatches, randomUUID, PURCHASE_HEADERS,
} from "../lib/importExport.js";
import {
  validateUploadFile, getOcrConfig, saveOcrConfig, redactOcrConfig,
  extractTextFromImage, parseOcrText,
} from "../lib/ocrProvider.js";

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

purchasesRouter.get("/check-duplicate", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { supplierId, supplierInvoiceNo, invoiceDate } = req.query;
    if (!supplierId || !supplierInvoiceNo) return res.json({ duplicate: false });
    const result = await checkDuplicatePurchase(org.id, supplierId, supplierInvoiceNo, invoiceDate || null);
    res.json(result);
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
    const dup = await checkDuplicatePurchase(org.id, req.body.supplierId, req.body.supplierInvoiceNo, req.body.invoiceDate);
    if (dup.duplicate) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_INVOICE",
          message: `A purchase invoice from this supplier with number ${req.body.supplierInvoiceNo} already exists (${dup.existing.internalNumber}).`,
          existing: dup.existing,
        },
      });
    }
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

purchasesRouter.post("/upload-ocr", uploadAny, async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const validation = validateUploadFile(req.file);
    if (!validation.ok) {
      return res.status(400).json({ error: { code: validation.error, message: validation.message } });
    }

    const base64Data = req.file.buffer.toString("base64");

    const companyProfile = await prisma.companyProfile.findUnique({ where: { organizationId: org.id }, select: { state: true, gstin: true } });
    const orgState = companyProfile?.gstin ? companyProfile.gstin.substring(0, 2) : (companyProfile?.state || "");
    const supplierState = parseResult?.supplier?.state || "";
    const autoTaxMode = (orgState && supplierState && orgState === supplierState) ? "INTRA_STATE_GST" : (orgState && supplierState ? "INTER_STATE_GST" : "INTRA_STATE_GST");

    const att = await prisma.purchaseAttachment.create({
      data: {
        organizationId: org.id,
        purchaseId: null,
        storageKey: randomUUID(),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: base64Data,
      },
    });

    const job = await prisma.ocrJob.create({
      data: { organizationId: org.id, purchaseId: null, provider: "pending", status: "PENDING" },
    });
    await prisma.purchaseAttachment.update({ where: { id: att.id }, data: { ocrJobId: job.id } });

    let rawText = "";
    let ocrStatus = "MANUAL";
    let parseResult = null;

    try {
      const ocrResult = await extractTextFromImage(org.id, base64Data, req.file.mimetype);
      if (ocrResult.status === "OK" && ocrResult.text && ocrResult.text.trim()) {
        rawText = ocrResult.text;
        ocrStatus = "EXTRACTED";
        parseResult = parseOcrText(rawText);
      } else if (ocrResult.status === "NOT_CONFIGURED") {
        ocrStatus = "NOT_CONFIGURED";
        parseResult = parseOcrText("");
      } else if (ocrResult.status === "UNKNOWN_PROVIDER") {
        ocrStatus = "NOT_CONFIGURED";
        parseResult = parseOcrText("");
      } else if (ocrResult.status === "OCR_FAILED") {
        ocrStatus = "OCR_FAILED";
        parseResult = parseOcrText("");
      } else {
        ocrStatus = "OCR_FAILED";
        parseResult = parseOcrText("");
      }
    } catch (ocrErr) {
      console.error("OCR extraction failed:", ocrErr.message);
      ocrStatus = "OCR_FAILED";
      parseResult = parseOcrText("");
    }

    if (!parseResult) {
      parseResult = parseOcrText("");
    }

    const suppliers = await prisma.supplier.findMany({
      where: { organizationId: org.id, isActive: true },
      select: { id: true, name: true, gstNumber: true, address: true, phone: true, email: true, state: true },
      orderBy: { name: "asc" },
    });

    const products = await prisma.product.findMany({
      where: { organizationId: org.id, isActive: true },
      include: { taxRate: true, unit: true, brand: true },
      orderBy: { name: "asc" },
    });

    const taxRates = await prisma.taxRate.findMany({ orderBy: { rate: "asc" } });

    let matchedSupplier = null;
    if (parseResult.supplier.gstin) {
      matchedSupplier = suppliers.find(s => s.gstNumber && s.gstNumber.toUpperCase() === parseResult.supplier.gstin.toUpperCase()) || null;
    }
    if (!matchedSupplier && parseResult.supplier.name) {
      const nameLower = parseResult.supplier.name.toLowerCase();
      matchedSupplier = suppliers.find(s => s.name.toLowerCase().includes(nameLower) || nameLower.includes(s.name.toLowerCase())) || null;
    }

    const matchedItems = parseResult.items.map(item => {
      let matchedProduct = null;
      const descLower = (item.description || "").toLowerCase();
      matchedProduct = products.find(p => p.name.toLowerCase() === descLower) ||
        products.find(p => p.name.toLowerCase().includes(descLower) || descLower.includes(p.name.toLowerCase())) || null;

      const taxRate = matchedProduct?.taxRate ? Number(matchedProduct.taxRate.rate) : (Number(item.gstPercent) || 0);
      return {
        ...item,
        productId: matchedProduct?.id || null,
        productName: matchedProduct?.name || item.description,
        taxRatePercent: taxRate,
        matched: Boolean(matchedProduct),
      };
    });

    await prisma.ocrJob.update({
      where: { id: job.id },
      data: {
        provider: ocrStatus === "NOT_CONFIGURED" ? "none" : "auto",
        status: ocrStatus === "EXTRACTED" ? "AWAITING_REVIEW" : ocrStatus === "NOT_CONFIGURED" ? "MANUAL_ENTRY" : "AWAITING_REVIEW",
        rawResult: rawText ? { text: rawText } : { note: "No text extracted; enter data manually" },
        extracted: parseResult,
      },
    });

    res.status(201).json({
      jobId: job.id,
      attachmentId: att.id,
      attachment: { id: att.id, fileName: att.fileName, mimeType: att.mimeType, size: att.size },
      ocrStatus,
      rawText,
      extracted: parseResult,
      matchedSupplier,
      matchedItems,
      autoTaxMode,
      suppliers,
      products: products.map(p => ({
        id: p.id, name: p.name, sku: p.sku, hsnCode: p.hsnCode,
        taxRate: p.taxRate ? Number(p.taxRate.rate) : 0,
        purchasePrice: Number(p.purchasePrice),
        unit: p.unit?.name || "Nos",
      })),
      taxRates: taxRates.map(t => ({ id: t.id, rate: Number(t.rate) })),
    });
  } catch (e) { next(e); }
});

purchasesRouter.post("/ocr/:jobId/apply", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const job = await prisma.ocrJob.findFirst({ where: { id: req.params.jobId, organizationId: org.id } });
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "OCR job not found" } });

    const dup = await checkDuplicatePurchase(org.id, req.body.supplierId, req.body.supplierInvoiceNo, req.body.invoiceDate);
    if (dup.duplicate) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_INVOICE",
          message: `Duplicate: this supplier already has invoice ${req.body.supplierInvoiceNo} (${dup.existing.internalNumber}).`,
          existing: dup.existing,
        },
      });
    }

    const purchase = await createPurchase(org.id, { ...req.body, source: "OCR" });

    await prisma.ocrJob.update({
      where: { id: job.id },
      data: { status: "APPLIED", purchaseId: purchase.id, extracted: req.body, reviewedAt: new Date() },
    });

    res.status(201).json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id/attachments", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const attachments = await prisma.purchaseAttachment.findMany({ where: { purchaseId: req.params.id, organizationId: org.id }, orderBy: { createdAt: "desc" } });
    res.json(attachments);
  } catch (e) { next(e); }
});

purchasesRouter.post("/:id/attachments", uploadAny, async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    if (!req.file) return res.status(400).json({ error: { code: "NO_FILE", message: "File required" } });
    const validation = validateUploadFile(req.file);
    if (!validation.ok) {
      return res.status(400).json({ error: { code: validation.error, message: validation.message } });
    }
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

purchasesRouter.get("/ocr/:jobId", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const job = await prisma.ocrJob.findFirst({ where: { id: req.params.jobId, organizationId: org.id } });
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found" } });
    res.json(job);
  } catch (e) { next(e); }
});

purchasesRouter.delete("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await deletePurchaseInvoice(req.params.id, org.id);
    res.json(result);
  } catch (e) { next(e); }
});
