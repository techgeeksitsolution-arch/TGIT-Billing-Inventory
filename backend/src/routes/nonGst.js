import { Router } from "express";
import {
  listNonGstBills,
  getNonGstBill,
  createNonGstBill,
  updateNonGstBill,
  finalizeNonGstBill,
  cancelNonGstBill,
  deleteNonGstBill,
} from "../services/nonGstService.js";

export const nonGstRouter = Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

nonGstRouter.get("/", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const result = await listNonGstBills(org.id, { page, limit, status: req.query.status, search: req.query.search });
  res.json(result);
}));

nonGstRouter.get("/:id", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const bill = await getNonGstBill(req.params.id, org.id);
  if (!bill) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Bill not found" } });
  res.json(bill);
}));

nonGstRouter.post("/", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const bill = await createNonGstBill(org.id, req.body);
  res.status(201).json(bill);
}));

nonGstRouter.put("/:id", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const bill = await updateNonGstBill(req.params.id, org.id, req.body);
  res.json(bill);
}));

nonGstRouter.post("/:id/finalize", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const bill = await finalizeNonGstBill(req.params.id, org.id);
  res.json(bill);
}));

nonGstRouter.post("/:id/cancel", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const bill = await cancelNonGstBill(req.params.id, org.id);
  res.json(bill);
}));

async function getOrgContext() {
  const { getOrCreateOrgAndUser } = await import("../db.js");
  return getOrCreateOrgAndUser();
}

nonGstRouter.delete("/:id", asyncHandler(async (req, res) => {
  const { org } = await getOrgContext();
  const result = await deleteNonGstBill(req.params.id, org.id);
  res.json(result);
}));
