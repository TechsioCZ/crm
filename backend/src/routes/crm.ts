import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../types/auth";

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const dateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .refine((query) => query.from <= query.to, {
    message: "`from` must be less than or equal to `to`.",
    path: ["to"]
  });

const createNoteSchema = z.object({
  text: z.string().trim().min(2).max(2000)
});

const createTaskSchema = z.object({
  description: z.string().trim().min(2).max(500),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["low", "medium", "high"]).default("medium")
});

const DAY_MS = 24 * 60 * 60 * 1000;

function toMoneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toPctString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function parseDateOnlyUtc(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toDateRangeUtc(fromDate: string, toDate: string): { fromUtc: Date; toUtc: Date } | null {
  const fromOnly = parseDateOnlyUtc(fromDate);
  const toOnly = parseDateOnlyUtc(toDate);
  if (!fromOnly || !toOnly) {
    return null;
  }

  const fromUtc = new Date(`${fromDate}T00:00:00.000Z`);
  const toUtc = new Date(`${toDate}T23:59:59.999Z`);

  return { fromUtc, toUtc };
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getAuthorizedCustomer(customerId: number, authUser: AuthUser) {
  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId
    },
    select: {
      id: true,
      name: true,
      assignments: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          salesRepId: true
        }
      }
    }
  });

  if (!customer) {
    return { customer: null, forbidden: false };
  }

  if (authUser.role === "sales_rep") {
    const activeSalesRepId = customer.assignments[0]?.salesRepId ?? null;
    if (activeSalesRepId !== authUser.userId) {
      return { customer: null, forbidden: true };
    }
  }

  return {
    customer: {
      id: customer.id,
      name: customer.name
    },
    forbidden: false
  };
}

async function computeProductTurnover(customerId: number, fromUtc: Date, toUtc: Date): Promise<Prisma.Decimal> {
  const aggregate = await prisma.orderItem.aggregate({
    _sum: {
      lineNetCzk: true
    },
    where: {
      lineType: "product",
      order: {
        customerId,
        importedAt: {
          gte: fromUtc,
          lte: toUtc
        }
      }
    }
  });

  return aggregate._sum.lineNetCzk ?? new Prisma.Decimal(0);
}

export const crmRouter = Router();

crmRouter.use(requireAuth);

crmRouter.get("/customers/:customerId/notes", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;

  const access = await getAuthorizedCustomer(customerId, authUser);
  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const notes = await prisma.customerNote.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.json({
    customer: access.customer,
    notes
  });
});

crmRouter.post("/customers/:customerId/notes", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const bodyParsed = createNoteSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid note payload." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;

  const access = await getAuthorizedCustomer(customerId, authUser);
  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const note = await prisma.customerNote.create({
    data: {
      customerId,
      authorUserId: authUser.userId,
      text: bodyParsed.data.text
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.status(201).json({
    customer: access.customer,
    note
  });
});

crmRouter.get("/customers/:customerId/tasks", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;

  const access = await getAuthorizedCustomer(customerId, authUser);
  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const tasks = await prisma.customerTask.findMany({
    where: {
      customerId
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.json({
    customer: access.customer,
    tasks
  });
});

crmRouter.post("/customers/:customerId/tasks", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const bodyParsed = createTaskSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid task payload." });
    return;
  }

  const dueDateOnly = parseDateOnlyUtc(bodyParsed.data.dueDate);
  if (!dueDateOnly) {
    res.status(400).json({ message: "Invalid due date." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;

  const access = await getAuthorizedCustomer(customerId, authUser);
  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const task = await prisma.customerTask.create({
    data: {
      customerId,
      ownerUserId: authUser.userId,
      description: bodyParsed.data.description,
      dueDate: dueDateOnly,
      priority: bodyParsed.data.priority,
      status: "open"
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.status(201).json({
    customer: access.customer,
    task
  });
});

crmRouter.get("/tasks/mine", async (req, res) => {
  const authUser = req.authUser!;

  const whereClause =
    authUser.role === "admin"
      ? {}
      : {
          ownerUserId: authUser.userId
        };

  const tasks = await prisma.customerTask.findMany({
    where: whereClause,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      customer: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.json({
    tasks,
    summary: {
      count: tasks.length
    }
  });
});

crmRouter.get("/customers/:customerId/turnover-trend", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const queryParsed = dateRangeSchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ message: "Invalid turnover trend query.", issues: queryParsed.error.flatten() });
    return;
  }

  const { from, to } = queryParsed.data;
  const currentRange = toDateRangeUtc(from, to);
  if (!currentRange) {
    res.status(400).json({ message: "Invalid date range." });
    return;
  }

  const currentFromDay = parseDateOnlyUtc(from);
  const currentToDay = parseDateOnlyUtc(to);
  if (!currentFromDay || !currentToDay) {
    res.status(400).json({ message: "Invalid date range." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;
  const access = await getAuthorizedCustomer(customerId, authUser);
  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const dayCount = Math.floor((currentToDay.getTime() - currentFromDay.getTime()) / DAY_MS) + 1;
  const previousToDay = addUtcDays(currentFromDay, -1);
  const previousFromDay = addUtcDays(previousToDay, -(dayCount - 1));

  const previousFrom = formatDateOnlyUtc(previousFromDay);
  const previousTo = formatDateOnlyUtc(previousToDay);
  const previousRange = toDateRangeUtc(previousFrom, previousTo);
  if (!previousRange) {
    res.status(400).json({ message: "Invalid previous date range." });
    return;
  }

  const [currentTurnover, previousTurnover] = await Promise.all([
    computeProductTurnover(customerId, currentRange.fromUtc, currentRange.toUtc),
    computeProductTurnover(customerId, previousRange.fromUtc, previousRange.toUtc)
  ]);

  const absoluteChange = currentTurnover.minus(previousTurnover);
  const changePct = previousTurnover.eq(0) ? null : absoluteChange.div(previousTurnover).mul(100);
  const direction = absoluteChange.eq(0) ? "flat" : absoluteChange.gt(0) ? "up" : "down";

  res.json({
    customer: access.customer,
    currentPeriod: {
      from,
      to,
      productTurnoverNetCzk: toMoneyString(currentTurnover)
    },
    previousPeriod: {
      from: previousFrom,
      to: previousTo,
      productTurnoverNetCzk: toMoneyString(previousTurnover)
    },
    comparison: {
      absoluteChangeNetCzk: toMoneyString(absoluteChange),
      changePct: changePct ? toPctString(changePct) : null,
      direction
    }
  });
});
