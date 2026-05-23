import { Router } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "crm-mvp-backend",
    timestamp: new Date().toISOString()
  });
});

healthRouter.get("/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();

    res.json({
      status: "ok",
      database: "connected",
      userCount
    });
  } catch {
    res.status(500).json({
      status: "error",
      database: "disconnected"
    });
  }
});
