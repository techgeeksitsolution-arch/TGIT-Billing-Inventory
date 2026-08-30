import { Router } from "express";
import { prisma } from "../db.js";
import { getOrCreateOrgAndUser } from "../db.js";

export const customersRouter = Router();

customersRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const customers = await prisma.customer.findMany({
      where: { organizationId: org.id, isActive: true },
      orderBy: { name: "asc" },
    });
    res.json(customers);
  } catch (e) { next(e); }
});

customersRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, organizationId: org.id },
    });
    if (!customer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });
    res.json(customer);
  } catch (e) { next(e); }
});

customersRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name: req.body.name,
        customerType: req.body.customerType || "NON_GST",
        gstNumber: req.body.gstNumber || null,
        address: req.body.address || null,
        phone: req.body.phone || null,
        mobile: req.body.mobile || null,
        email: req.body.email || null,
        state: req.body.state || null,
        pin: req.body.pin || null,
        notes: req.body.notes || null,
      },
    });
    res.status(201).json(customer);
  } catch (e) { next(e); }
});

customersRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, organizationId: org.id },
    });
    if (!customer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer not found" } });
    const updated = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name !== undefined ? req.body.name : customer.name,
        customerType: req.body.customerType !== undefined ? req.body.customerType : customer.customerType,
        gstNumber: req.body.gstNumber !== undefined ? req.body.gstNumber : customer.gstNumber,
        address: req.body.address !== undefined ? req.body.address : customer.address,
        phone: req.body.phone !== undefined ? req.body.phone : customer.phone,
        mobile: req.body.mobile !== undefined ? req.body.mobile : customer.mobile,
        email: req.body.email !== undefined ? req.body.email : customer.email,
        state: req.body.state !== undefined ? req.body.state : customer.state,
        pin: req.body.pin !== undefined ? req.body.pin : customer.pin,
        notes: req.body.notes !== undefined ? req.body.notes : customer.notes,
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});
