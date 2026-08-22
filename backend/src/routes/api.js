import { Router } from "express";
import { z } from "zod";

export const apiRouter = Router();

const statusQuery = z.object({
  detail: z.enum(["basic", "full"]).optional().default("basic")
});

apiRouter.get("/health", (req, res) => {
  const result = statusQuery.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({
      error: { code: "INVALID_QUERY", message: "Invalid health query" },
      details: result.error.flatten()
    });
  }

  const response = {
    status: "ok",
    service: "tgit-billing-inventory-api",
    version: "v1",
    timestamp: new Date().toISOString()
  };

  if (result.data.detail === "full") {
    response.environment = process.env.NODE_ENV || "development";
  }

  return res.json(response);
});
