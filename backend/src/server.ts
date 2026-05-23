import "dotenv/config";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { customersRouter } from "./routes/customers";

const app = express();
const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  })
);
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/customers", customersRouter);

app.get("/", (_req, res) => {
  res.json({
    message: "CRM MVP backend is running.",
    docs: {
      health: "/api/health",
      db: "/api/health/db",
      login: "POST /api/auth/login",
      adminCustomers: "GET /api/admin/customers",
      adminXmlImport: "POST /api/admin/imports/orders/xml",
      adminImportHistory: "GET /api/admin/imports",
      roleCustomers: "GET /api/customers"
    }
  });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});
