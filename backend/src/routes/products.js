import { Router } from "express";
import { prisma, getOrCreateOrgAndUser } from "../db.js";

export const productsRouter = Router();

productsRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const products = await prisma.product.findMany({
      where: { organizationId: org.id, isActive: true },
      include: { unit: true, taxRate: true, brand: true, category: true },
      orderBy: { name: "asc" },
    });
    res.json(products);
  } catch (e) { next(e); }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, organizationId: org.id },
      include: { unit: true, taxRate: true, brand: true, category: true },
    });
    if (!product) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Product not found" } });
    res.json(product);
  } catch (e) { next(e); }
});

productsRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    let unitId = req.body.unitId;
    if (!unitId) {
      const unit = await prisma.unit.findFirst({ where: { code: "NOS" } });
      if (unit) unitId = unit.id;
    }
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        sku: req.body.sku,
        name: req.body.name,
        unitId: unitId,
        taxRateId: req.body.taxRateId || null,
        hsnCode: req.body.hsnCode || null,
        purchasePrice: req.body.purchasePrice || 0,
        sellingPrice: req.body.sellingPrice || 0,
        currentStock: req.body.currentStock || 0,
        minimumStock: req.body.minimumStock || 0,
      },
      include: { unit: true, taxRate: true },
    });
    res.status(201).json(product);
  } catch (e) { next(e); }
});

export const servicesRouter = Router();

servicesRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const services = await prisma.service.findMany({
      where: { organizationId: org.id, isActive: true },
      include: { taxRate: true },
      orderBy: { name: "asc" },
    });
    res.json(services);
  } catch (e) { next(e); }
});

servicesRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, organizationId: org.id },
      include: { taxRate: true },
    });
    if (!service) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Service not found" } });
    res.json(service);
  } catch (e) { next(e); }
});

servicesRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const service = await prisma.service.create({
      data: {
        organizationId: org.id,
        code: req.body.code,
        name: req.body.name,
        description: req.body.description || null,
        sacCode: req.body.sacCode || null,
        defaultRate: req.body.defaultRate || 0,
        taxRateId: req.body.taxRateId || null,
      },
      include: { taxRate: true },
    });
    res.status(201).json(service);
  } catch (e) { next(e); }
});
