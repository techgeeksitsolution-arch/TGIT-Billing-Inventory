import { Router } from "express";
import { prisma, getOrCreateOrgAndUser } from "../db.js";

export const suppliersRouter = Router();

suppliersRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const search = req.query.search;
    const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";
    const where = { organizationId: org.id };
    if (!includeInactive) where.isActive = true;
    if (search) where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { gstNumber: { contains: search, mode: "insensitive" } },
    ];
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: "asc" } });
    res.json(suppliers);
  } catch (e) { next(e); }
});

suppliersRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!supplier) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Supplier not found" } });
    res.json(supplier);
  } catch (e) { next(e); }
});

suppliersRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: org.id,
        name: req.body.name,
        gstNumber: req.body.gstNumber || null,
        contactPerson: req.body.contactPerson || null,
        address: req.body.address || null,
        phone: req.body.phone || null,
        mobile: req.body.mobile || null,
        email: req.body.email || null,
        state: req.body.state || null,
        pin: req.body.pin || null,
        notes: req.body.notes || null,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      },
    });
    res.status(201).json(supplier);
  } catch (e) { next(e); }
});

suppliersRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Supplier not found" } });
    const updated = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name !== undefined ? req.body.name : existing.name,
        gstNumber: req.body.gstNumber !== undefined ? req.body.gstNumber : existing.gstNumber,
        contactPerson: req.body.contactPerson !== undefined ? req.body.contactPerson : existing.contactPerson,
        address: req.body.address !== undefined ? req.body.address : existing.address,
        phone: req.body.phone !== undefined ? req.body.phone : existing.phone,
        mobile: req.body.mobile !== undefined ? req.body.mobile : existing.mobile,
        email: req.body.email !== undefined ? req.body.email : existing.email,
        state: req.body.state !== undefined ? req.body.state : existing.state,
        pin: req.body.pin !== undefined ? req.body.pin : existing.pin,
        notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
        isActive: req.body.isActive !== undefined ? req.body.isActive : existing.isActive,
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

suppliersRouter.put("/:id/status", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Supplier not found" } });
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !existing.isActive;
    const updated = await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive } });
    res.json(updated);
  } catch (e) { next(e); }
});
