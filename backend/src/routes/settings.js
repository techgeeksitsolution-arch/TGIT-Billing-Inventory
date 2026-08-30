import { Router } from "express";
import { prisma, getOrCreateOrgAndUser } from "../db.js";
import { getCurrentFinancialYear } from "../lib/utils.js";

export const settingsRouter = Router();

const FY_KEY = "activeFinancialYear";

settingsRouter.get("/financial-year", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const setting = await prisma.setting.findUnique({
      where: { organizationId_key: { organizationId: org.id, key: FY_KEY } },
    });
    const value = setting?.value || getCurrentFinancialYear();
    res.json({ financialYear: value });
  } catch (e) { next(e); }
});

settingsRouter.put("/financial-year", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { financialYear } = req.body;
    if (!financialYear || typeof financialYear !== "string") {
      return res.status(400).json({ error: { code: "INVALID_INPUT", message: "financialYear is required" } });
    }
    if (!/^\d{2}-\d{2}$/.test(financialYear)) {
      return res.status(400).json({ error: { code: "INVALID_FORMAT", message: "Financial year must be in YY-YY format (e.g. 26-27)" } });
    }
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: FY_KEY } },
      update: { value: financialYear },
      create: { organizationId: org.id, key: FY_KEY, value: financialYear },
    });
    res.json({ financialYear });
  } catch (e) { next(e); }
});

async function getOrCreateProfile(orgId) {
  let profile = await prisma.companyProfile.findUnique({ where: { organizationId: orgId } });
  if (!profile) {
    profile = await prisma.companyProfile.create({ data: { organizationId: orgId } });
  }
  return profile;
}

settingsRouter.get("/company-profile", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const profile = await getOrCreateProfile(org.id);
    res.json(profile);
  } catch (e) { next(e); }
});

settingsRouter.put("/company-profile", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const fields = ["name", "gstin", "udyam", "address", "phone", "mobile", "email", "website", "state", "pin", "bankName", "branch", "accountName", "accountNumber", "ifsc", "upiId", "invoiceFooter", "invoiceNotes", "logoStorageKey", "logoBase64", "salesPrefix", "quotationPrefix", "purchasePrefix", "nonGstPrefix"];
    const data = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) data[f] = req.body[f] === "" ? null : req.body[f];
    }
    const profile = await prisma.companyProfile.upsert({
      where: { organizationId: org.id },
      update: data,
      create: { organizationId: org.id, ...data },
    });
    res.json(profile);
  } catch (e) { next(e); }
});

settingsRouter.get("/terms", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const termType = req.query.type || "SALES";
    const terms = await prisma.documentTerm.findMany({
      where: { organizationId: org.id, termType },
      orderBy: { sortOrder: "asc" },
    });
    res.json(terms);
  } catch (e) { next(e); }
});

settingsRouter.post("/terms", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { termType, text, sortOrder, isEnabled } = req.body;
    if (!termType || !text) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "termType and text are required" } });
    const count = await prisma.documentTerm.count({ where: { organizationId: org.id, termType } });
    const term = await prisma.documentTerm.create({
      data: {
        organizationId: org.id,
        termType,
        text,
        sortOrder: sortOrder != null ? sortOrder : count,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
      },
    });
    res.status(201).json(term);
  } catch (e) { next(e); }
});

settingsRouter.put("/terms/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { text, sortOrder, isEnabled } = req.body;
    const data = {};
    if (text !== undefined) data.text = text;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    const term = await prisma.documentTerm.update({
      where: { id: req.params.id },
      data,
    });
    res.json(term);
  } catch (e) { next(e); }
});

settingsRouter.delete("/terms/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    await prisma.documentTerm.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

settingsRouter.post("/terms/reorder", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "orderedIds array required" } });
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.documentTerm.update({ where: { id }, data: { sortOrder: idx } })
      )
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const OCR_CONFIG_KEY = "ocrProvider";

settingsRouter.get("/ocr-config", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const s = await prisma.setting.findUnique({ where: { organizationId_key: { organizationId: org.id, key: OCR_CONFIG_KEY } } });
    const cfg = s?.value ? JSON.parse(s.value) : { provider: null, endpoint: null, model: null, enabled: false };
    const redacted = { provider: cfg.provider || null, endpoint: cfg.endpoint || null, model: cfg.model || null, enabled: Boolean(cfg.enabled) };
    res.json(redacted);
  } catch (e) { next(e); }
});

settingsRouter.put("/ocr-config", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { provider, endpoint, model, apiKey, enabled } = req.body;
    if (!provider) return res.status(400).json({ error: { code: "INVALID_INPUT", message: "provider is required" } });
    const cfg = {
      provider,
      endpoint: endpoint || null,
      model: model || null,
      apiKey: apiKey || null,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
    };
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: OCR_CONFIG_KEY } },
      update: { value: JSON.stringify(cfg) },
      create: { organizationId: org.id, key: OCR_CONFIG_KEY, value: JSON.stringify(cfg) },
    });
    res.json({ provider: cfg.provider, endpoint: cfg.endpoint, model: cfg.model, enabled: cfg.enabled });
  } catch (e) { next(e); }
});
