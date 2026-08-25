import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { salesRouter } from "./routes/sales.js";
import { quotationsRouter } from "./routes/quotations.js";
import { customersRouter } from "./routes/customers.js";
import { productsRouter, servicesRouter } from "./routes/products.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { purchasesRouter } from "./routes/purchases.js";
import { settingsRouter } from "./routes/settings.js";
import { nonGstRouter } from "./routes/nonGst.js";
import { notFound, errorHandler } from "./middleware/errors.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/api/v1", apiRouter);
app.use("/api/v1/sales", salesRouter);
app.use("/api/v1/quotations", quotationsRouter);
app.use("/api/v1/customers", customersRouter);
app.use("/api/v1/products", productsRouter);
app.use("/api/v1/services", servicesRouter);
app.use("/api/v1/suppliers", suppliersRouter);
app.use("/api/v1/purchases", purchasesRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/nongst", nonGstRouter);
app.use(notFound);
app.use(errorHandler);
