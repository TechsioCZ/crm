import "dotenv/config";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { customersRouter } from "./routes/customers";
import { recommendationsRouter } from "./routes/recommendations";
import { crmRouter } from "./routes/crm";
import { workspaceRouter } from "./routes/workspace";
import { logDevUsersFileReminder } from "./lib/dev-users";

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
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/crm", crmRouter);
app.use("/api/workspace", workspaceRouter);

app.get("/", (_req, res) => {
  res.json({
    message: "CRM MVP backend is running.",
    docs: {
      health: "/api/health",
      db: "/api/health/db",
      login: "POST /api/auth/login",
      devUsers: "GET/POST/DELETE /api/auth/dev-users",
      adminCustomers: "GET /api/admin/customers",
      adminXmlImport: "POST /api/admin/imports/orders/xml",
      adminImportHistory: "GET /api/admin/imports",
      roleCustomers: "GET /api/customers",
      customerProductAnalytics: "GET /api/customers/:customerId/analytics/product?from=YYYY-MM-DD&to=YYYY-MM-DD",
      recommendationGroups: "GET/POST /api/recommendations/groups",
      recommendationGroupMembers: "GET /api/recommendations/groups/:groupId/members",
      recommendationRules: "GET/POST /api/recommendations/rules",
      recommendationOpportunities: "GET /api/recommendations/opportunities",
      recommendationByCustomer: "GET /api/recommendations/customers/:customerId",
      crmNotes: "GET/POST /api/crm/customers/:customerId/notes",
      crmCustomerTasks: "GET/POST /api/crm/customers/:customerId/tasks",
      crmMyTasks: "GET /api/crm/tasks/mine",
      crmTurnoverTrend: "GET /api/crm/customers/:customerId/turnover-trend?from=YYYY-MM-DD&to=YYYY-MM-DD",
      workspaceMeta: "GET /api/workspace/meta",
      workspaceContacts: "GET /api/workspace/contacts",
      workspaceContactDetail: "GET /api/workspace/contacts/:customerId/detail",
      workspaceProducts: "GET /api/workspace/products",
      workspaceOrders: "GET /api/workspace/orders",
      workspaceOrderDetail: "GET /api/workspace/orders/:orderDbId",
      workspaceCategories: "GET/POST/PATCH /api/workspace/categories",
      workspaceTopProducts: "GET/POST/PATCH /api/workspace/top-products",
      workspaceDashboard: "GET /api/workspace/dashboard"
    }
  });
});

logDevUsersFileReminder();

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});
