import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../types/auth";

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const productAnalyticsQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .refine((query) => query.from <= query.to, {
    message: "`from` must be less than or equal to `to`.",
    path: ["to"]
  });

function dateRangeToUtc(fromDate: string, toDate: string): { fromUtc: Date; toUtc: Date } {
  const fromUtc = new Date(`${fromDate}T00:00:00.000Z`);
  const toUtc = new Date(`${toDate}T23:59:59.999Z`);

  return { fromUtc, toUtc };
}

function decimalZero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function toMoneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

async function getCustomerForAuthorizedUser(customerId: number, authUser: AuthUser) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      assignments: {
        orderBy: { startedAt: "desc" },
        include: {
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          assignedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }
    }
  });

  if (!customer) {
    return { customer: null, currentAssignment: null, forbidden: false };
  }

  const currentAssignment = customer.assignments.find((item) => item.endedAt === null) ?? null;

  if (authUser.role === "sales_rep") {
    if (!currentAssignment || currentAssignment.salesRepId !== authUser.userId) {
      return { customer: null, currentAssignment: null, forbidden: true };
    }
  }

  return { customer, currentAssignment, forbidden: false };
}

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", async (req, res) => {
  const authUser = req.authUser!;

  const whereClause =
    authUser.role === "admin"
      ? {}
      : {
          assignments: {
            some: {
              endedAt: null,
              salesRepId: authUser.userId
            }
          }
        };

  const customers = await prisma.customer.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    include: {
      assignments: {
        where: { endedAt: null },
        include: {
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        take: 1,
        orderBy: { startedAt: "desc" }
      }
    }
  });

  const response = customers.map((customer) => {
    const currentAssignment = customer.assignments[0] ?? null;

    return {
      id: customer.id,
      name: customer.name,
      currentAssignment,
      isMine: currentAssignment?.salesRepId === authUser.userId
    };
  });

  res.json({ customers: response });
});

customersRouter.get("/:customerId/analytics/product", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const queryParsed = productAnalyticsQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ message: "Invalid analytics period.", issues: queryParsed.error.flatten() });
    return;
  }

  const authUser = req.authUser!;
  const customerId = paramParsed.data.customerId;

  const access = await getCustomerForAuthorizedUser(customerId, authUser);

  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const { from, to } = queryParsed.data;
  const { fromUtc, toUtc } = dateRangeToUtc(from, to);

  const orderWhere = {
    customerId,
    importedAt: {
      gte: fromUtc,
      lte: toUtc
    }
  };

  const [ordersCount, orderItems] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.orderItem.findMany({
      where: {
        order: orderWhere
      },
      select: {
        lineType: true,
        sku: true,
        name: true,
        category: true,
        lineNetCzk: true
      }
    })
  ]);

  let productTurnover = decimalZero();
  let shippingTurnover = decimalZero();
  let paymentTurnover = decimalZero();
  let otherTurnover = decimalZero();

  const productByKey = new Map<
    string,
    {
      sku: string | null;
      name: string | null;
      category: string | null;
      turnover: Prisma.Decimal;
      lineCount: number;
    }
  >();

  const categoryByKey = new Map<
    string,
    {
      category: string;
      turnover: Prisma.Decimal;
      lineCount: number;
    }
  >();

  for (const item of orderItems) {
    if (item.lineType === "product") {
      productTurnover = productTurnover.plus(item.lineNetCzk);

      const productKey = `${item.sku ?? ""}|${item.name ?? ""}|${item.category ?? ""}`;
      const productCurrent = productByKey.get(productKey);

      if (productCurrent) {
        productCurrent.turnover = productCurrent.turnover.plus(item.lineNetCzk);
        productCurrent.lineCount += 1;
      } else {
        productByKey.set(productKey, {
          sku: item.sku,
          name: item.name,
          category: item.category,
          turnover: new Prisma.Decimal(item.lineNetCzk),
          lineCount: 1
        });
      }

      const categoryLabel = item.category ?? "Uncategorized";
      const categoryCurrent = categoryByKey.get(categoryLabel);
      if (categoryCurrent) {
        categoryCurrent.turnover = categoryCurrent.turnover.plus(item.lineNetCzk);
        categoryCurrent.lineCount += 1;
      } else {
        categoryByKey.set(categoryLabel, {
          category: categoryLabel,
          turnover: new Prisma.Decimal(item.lineNetCzk),
          lineCount: 1
        });
      }
      continue;
    }

    if (item.lineType === "shipping") {
      shippingTurnover = shippingTurnover.plus(item.lineNetCzk);
      continue;
    }

    if (item.lineType === "payment") {
      paymentTurnover = paymentTurnover.plus(item.lineNetCzk);
      continue;
    }

    otherTurnover = otherTurnover.plus(item.lineNetCzk);
  }

  const productBreakdown = [...productByKey.entries()]
    .map(([key, value]) => ({
      key,
      sku: value.sku,
      name: value.name,
      category: value.category,
      turnover: value.turnover,
      lineCount: value.lineCount
    }))
    .sort((left, right) => {
      const cmp = right.turnover.comparedTo(left.turnover);
      if (cmp !== 0) {
        return cmp;
      }

      return left.key.localeCompare(right.key);
    })
    .map((row) => ({
      key: row.key,
      sku: row.sku,
      name: row.name,
      category: row.category,
      turnoverNetCzk: toMoneyString(row.turnover),
      lineCount: row.lineCount
    }));

  const categoryBreakdown = [...categoryByKey.values()]
    .map((value) => ({
      category: value.category,
      turnover: value.turnover,
      lineCount: value.lineCount
    }))
    .sort((left, right) => {
      const cmp = right.turnover.comparedTo(left.turnover);
      if (cmp !== 0) {
        return cmp;
      }

      return left.category.localeCompare(right.category);
    })
    .map((row) => ({
      category: row.category,
      turnoverNetCzk: toMoneyString(row.turnover),
      lineCount: row.lineCount
    }));

  const allLinesTurnover = productTurnover.plus(shippingTurnover).plus(paymentTurnover).plus(otherTurnover);

  res.json({
    period: {
      from,
      to,
      fromUtc: fromUtc.toISOString(),
      toUtc: toUtc.toISOString()
    },
    customer: {
      id: access.customer.id,
      name: access.customer.name
    },
    totals: {
      ordersCount,
      itemLinesCount: orderItems.length,
      productItemLinesCount: productBreakdown.reduce((sum, row) => sum + row.lineCount, 0),
      productNetCzk: toMoneyString(productTurnover),
      shippingNetCzk: toMoneyString(shippingTurnover),
      paymentNetCzk: toMoneyString(paymentTurnover),
      otherNetCzk: toMoneyString(otherTurnover),
      allItemLinesNetCzk: toMoneyString(allLinesTurnover)
    },
    productBreakdown,
    categoryBreakdown
  });
});

customersRouter.get("/:customerId", async (req, res) => {
  const parsed = customerIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = parsed.data.customerId;

  const access = await getCustomerForAuthorizedUser(customerId, authUser);

  if (access.forbidden) {
    res.status(403).json({ message: "You do not have access to this customer." });
    return;
  }

  if (!access.customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  res.json({
    customer: {
      id: access.customer.id,
      name: access.customer.name,
      currentAssignment: access.currentAssignment,
      assignmentHistory: access.customer.assignments
    }
  });
});
