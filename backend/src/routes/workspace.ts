import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import type { AuthUser } from "../types/auth";

const contactsQuerySchema = z.object({
  name: z.string().trim().optional(),
  salesRepId: z.coerce.number().int().positive().optional(),
  hasOrders: z.enum(["any", "yes", "no"]).default("any"),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const productsQuerySchema = z.object({
  name: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  category: z.string().trim().optional(),
  isActive: z.enum(["any", "true", "false"]).default("any"),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const ordersQuerySchema = z.object({
  orderId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  salesRepId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const categoriesQuerySchema = z.object({
  name: z.string().trim().optional()
});

const topProductsQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  isActive: z.enum(["any", "true", "false"]).default("any"),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120)
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(120)
});

const createTopProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  sku: z.string().trim().min(1).max(80).optional(),
  categoryName: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional()
});

const updateTopProductSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  sku: z.string().trim().min(1).max(80).nullable().optional(),
  categoryName: z.string().trim().min(1).max(120).nullable().optional(),
  isActive: z.boolean().optional()
});

const categoryIdParamSchema = z.object({
  categoryId: z.coerce.number().int().positive()
});

const topProductIdParamSchema = z.object({
  topProductId: z.coerce.number().int().positive()
});

const contactIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const orderDbIdParamSchema = z.object({
  orderDbId: z.coerce.number().int().positive()
});

function normalizeToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function toMoneyString(value: number): string {
  return value.toFixed(2);
}

function decimalToMoneyOrNull(value: Prisma.Decimal | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toFixed(2);
}

async function getVisibleCustomerIds(authUser: AuthUser): Promise<Set<number>> {
  if (authUser.role === "admin") {
    const allRows = await prisma.customer.findMany({
      select: { id: true }
    });
    return new Set(allRows.map((row) => row.id));
  }

  const rows = await prisma.customerAssignment.findMany({
    where: {
      endedAt: null,
      salesRepId: authUser.userId
    },
    select: {
      customerId: true
    },
    distinct: ["customerId"]
  });

  return new Set(rows.map((row) => row.customerId));
}

function getCustomerVisibilityWhere(authUser: AuthUser): Prisma.CustomerWhereInput {
  if (authUser.role === "admin") {
    return {};
  }

  return {
    assignments: {
      some: {
        endedAt: null,
        salesRepId: authUser.userId
      }
    }
  };
}

function getOrderVisibilityWhere(authUser: AuthUser): Prisma.OrderWhereInput {
  if (authUser.role === "admin") {
    return {};
  }

  return {
    customer: {
      assignments: {
        some: {
          endedAt: null,
          salesRepId: authUser.userId
        }
      }
    }
  };
}

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

workspaceRouter.get("/meta", async (req, res) => {
  const authUser = req.authUser!;

  const [salesReps, categories, orderStatusesRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: "sales_rep",
        isActive: true,
        ...(authUser.role === "admin" ? {} : { id: authUser.userId })
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true
      }
    }),
    prisma.catalogCategory.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true
      }
    }),
    prisma.order.findMany({
      where: getOrderVisibilityWhere(authUser),
      select: {
        status: true
      },
      distinct: ["status"],
      orderBy: {
        status: "asc"
      }
    })
  ]);

  res.json({
    salesReps,
    categories,
    orderStatuses: orderStatusesRows.map((row) => row.status)
  });
});

workspaceRouter.get("/contacts", async (req, res) => {
  const parsed = contactsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid contacts query." });
    return;
  }

  const authUser = req.authUser!;
  const { name, salesRepId, hasOrders, limit } = parsed.data;

  const whereClause: Prisma.CustomerWhereInput = {
    ...getCustomerVisibilityWhere(authUser)
  };

  if (name) {
    whereClause.name = { contains: name, mode: "insensitive" };
  }

  if (salesRepId) {
    whereClause.assignments = {
      some: {
        endedAt: null,
        salesRepId
      }
    };
  }

  if (hasOrders === "yes") {
    whereClause.orders = { some: {} };
  } else if (hasOrders === "no") {
    whereClause.orders = { none: {} };
  }

  const customers = await prisma.customer.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    take: limit,
    include: {
      assignments: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          salesRep: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      _count: {
        select: {
          orders: true,
          notes: true,
          tasks: true
        }
      }
    }
  });

  res.json({
    contacts: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      currentSalesRep: customer.assignments[0]?.salesRep ?? null,
      ordersCount: customer._count.orders,
      notesCount: customer._count.notes,
      tasksCount: customer._count.tasks,
      createdAt: customer.createdAt
    })),
    summary: {
      count: customers.length
    }
  });
});

workspaceRouter.get("/contacts/:customerId/detail", async (req, res) => {
  const parsedParam = contactIdParamSchema.safeParse(req.params);
  if (!parsedParam.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = parsedParam.data.customerId;

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [getCustomerVisibilityWhere(authUser), { id: customerId }]
    },
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
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      tasks: {
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
      },
      orders: {
        orderBy: [{ importedAt: "desc" }, { id: "desc" }]
      },
      _count: {
        select: {
          orders: true,
          notes: true,
          tasks: true
        }
      }
    }
  });

  if (!customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const currentAssignment = customer.assignments.find((assignment) => assignment.endedAt === null) ?? null;
  const orderIds = customer.orders.map((order) => order.id);
  const totalsRows =
    orderIds.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["orderDbId", "lineType"],
          where: {
            orderDbId: { in: orderIds }
          },
          _sum: {
            lineNetCzk: true
          },
          _count: {
            _all: true
          }
        });

  const totalsMap = new Map<number, { product: number; shipping: number; payment: number; other: number; lines: number }>();
  for (const row of totalsRows) {
    const current = totalsMap.get(row.orderDbId) ?? { product: 0, shipping: 0, payment: 0, other: 0, lines: 0 };
    const value = Number.parseFloat(row._sum.lineNetCzk?.toString() ?? "0");

    if (row.lineType === "product") {
      current.product += value;
    } else if (row.lineType === "shipping") {
      current.shipping += value;
    } else if (row.lineType === "payment") {
      current.payment += value;
    } else {
      current.other += value;
    }

    current.lines += row._count._all;
    totalsMap.set(row.orderDbId, current);
  }

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      createdAt: customer.createdAt,
      currentSalesRep: currentAssignment?.salesRep ?? null,
      assignmentHistory: customer.assignments,
      summary: {
        ordersCount: customer._count.orders,
        notesCount: customer._count.notes,
        tasksCount: customer._count.tasks
      }
    },
    orders: customer.orders.map((order) => {
      const totals = totalsMap.get(order.id) ?? { product: 0, shipping: 0, payment: 0, other: 0, lines: 0 };
      return {
        id: order.id,
        orderId: order.orderId,
        status: order.status,
        importedAt: order.importedAt,
        totals: {
          lineCount: totals.lines,
          productNetCzk: toMoneyString(totals.product),
          shippingNetCzk: toMoneyString(totals.shipping),
          paymentNetCzk: toMoneyString(totals.payment),
          otherNetCzk: toMoneyString(totals.other),
          allNetCzk: toMoneyString(totals.product + totals.shipping + totals.payment + totals.other)
        }
      };
    }),
    notes: customer.notes.map((note) => ({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      author: note.author
    })),
    tasks: customer.tasks.map((task) => ({
      id: task.id,
      description: task.description,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      owner: task.owner
    }))
  });
});

workspaceRouter.get("/products", async (req, res) => {
  const parsed = productsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid products query." });
    return;
  }

  const authUser = req.authUser!;
  const { name, sku, category, isActive, limit } = parsed.data;
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);

  const whereClause: Prisma.GlobalTopProductWhereInput = {};
  if (name) {
    whereClause.name = { contains: name, mode: "insensitive" };
  }
  if (sku) {
    whereClause.sku = { contains: sku, mode: "insensitive" };
  }
  if (category) {
    whereClause.categoryName = { contains: category, mode: "insensitive" };
  }
  if (isActive === "true") {
    whereClause.isActive = true;
  } else if (isActive === "false") {
    whereClause.isActive = false;
  }

  const products = await prisma.globalTopProduct.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    take: limit
  });

  const skuList = products.map((product) => product.sku).filter((item): item is string => Boolean(item));
  const turnoverRows =
    visibleCustomerIds.size === 0 || skuList.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["sku"],
          where: {
            lineType: "product",
            sku: { in: skuList },
            order: {
              customerId: { in: [...visibleCustomerIds] }
            }
          },
          _sum: {
            lineNetCzk: true
          },
          _count: {
            _all: true
          }
        });

  const turnoverMap = new Map<string, { turnover: string; lines: number }>();
  for (const row of turnoverRows) {
    const rowSku = row.sku ?? "";
    turnoverMap.set(rowSku, {
      turnover: row._sum.lineNetCzk?.toFixed(2) ?? "0.00",
      lines: row._count._all
    });
  }

  res.json({
    products: products.map((product) => {
      const stats = product.sku ? turnoverMap.get(product.sku) : undefined;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        categoryName: product.categoryName,
        unitPriceNetCzk: decimalToMoneyOrNull(product.unitPriceNetCzk),
        stockQuantity: product.stockQuantity,
        historicalSalesQty: product.historicalSalesQty,
        incomingFromSupplierQty: product.incomingFromSupplierQty,
        isActive: product.isActive,
        turnoverNetCzk: stats?.turnover ?? "0.00",
        orderItemLines: stats?.lines ?? 0,
        createdAt: product.createdAt
      };
    }),
    summary: {
      count: products.length
    }
  });
});

workspaceRouter.get("/orders", async (req, res) => {
  const parsed = ordersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid orders query." });
    return;
  }

  const authUser = req.authUser!;
  const { orderId, status, customerName, salesRepId, dateFrom, dateTo, limit } = parsed.data;

  const conditions: Prisma.OrderWhereInput[] = [getOrderVisibilityWhere(authUser)];

  if (orderId) {
    conditions.push({ orderId: { contains: orderId, mode: "insensitive" } });
  }
  if (status) {
    conditions.push({ status: { contains: status, mode: "insensitive" } });
  }
  if (customerName) {
    conditions.push({
      customer: {
        name: { contains: customerName, mode: "insensitive" }
      }
    });
  }
  if (salesRepId) {
    conditions.push({
      customer: {
        assignments: {
          some: {
            endedAt: null,
            salesRepId
          }
        }
      }
    });
  }
  if (dateFrom || dateTo) {
    conditions.push({
      importedAt: {
        ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {})
      }
    });
  }

  const orders = await prisma.order.findMany({
    where: {
      AND: conditions
    },
    orderBy: [{ importedAt: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      customer: {
        include: {
          assignments: {
            where: { endedAt: null },
            orderBy: { startedAt: "desc" },
            take: 1,
            include: {
              salesRep: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  const orderIds = orders.map((order) => order.id);
  const totalsRows =
    orderIds.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["orderDbId", "lineType"],
          where: {
            orderDbId: { in: orderIds }
          },
          _sum: {
            lineNetCzk: true
          },
          _count: {
            _all: true
          }
        });

  const totalsMap = new Map<number, { product: number; shipping: number; payment: number; other: number; lines: number }>();
  for (const row of totalsRows) {
    const current = totalsMap.get(row.orderDbId) ?? { product: 0, shipping: 0, payment: 0, other: 0, lines: 0 };
    const value = Number.parseFloat(row._sum.lineNetCzk?.toString() ?? "0");

    if (row.lineType === "product") {
      current.product += value;
    } else if (row.lineType === "shipping") {
      current.shipping += value;
    } else if (row.lineType === "payment") {
      current.payment += value;
    } else {
      current.other += value;
    }

    current.lines += row._count._all;
    totalsMap.set(row.orderDbId, current);
  }

  res.json({
    orders: orders.map((order) => {
      const totals = totalsMap.get(order.id) ?? { product: 0, shipping: 0, payment: 0, other: 0, lines: 0 };
      return {
        id: order.id,
        orderId: order.orderId,
        status: order.status,
        importedAt: order.importedAt,
        customer: {
          id: order.customer.id,
          name: order.customer.name
        },
        currentSalesRep: order.customer.assignments[0]?.salesRep ?? null,
        totals: {
          lineCount: totals.lines,
          productNetCzk: toMoneyString(totals.product),
          shippingNetCzk: toMoneyString(totals.shipping),
          paymentNetCzk: toMoneyString(totals.payment),
          otherNetCzk: toMoneyString(totals.other),
          allNetCzk: toMoneyString(totals.product + totals.shipping + totals.payment + totals.other)
        }
      };
    }),
    summary: {
      count: orders.length
    }
  });
});

workspaceRouter.get("/orders/:orderDbId", async (req, res) => {
  const paramParsed = orderDbIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid order id." });
    return;
  }

  const authUser = req.authUser!;
  const orderDbId = paramParsed.data.orderDbId;

  const order = await prisma.order.findFirst({
    where: {
      AND: [getOrderVisibilityWhere(authUser), { id: orderDbId }]
    },
    include: {
      customer: {
        include: {
          assignments: {
            where: { endedAt: null },
            orderBy: { startedAt: "desc" },
            take: 1,
            include: {
              salesRep: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      },
      items: {
        where: {
          lineType: "product"
        },
        orderBy: { id: "asc" }
      }
    }
  });

  if (!order) {
    res.status(404).json({ message: "Order not found." });
    return;
  }

  const skuCandidates = [...new Set(order.items.map((item) => item.sku?.trim()).filter((item): item is string => Boolean(item)))];
  const nameCandidates = [...new Set(order.items.map((item) => item.name?.trim()).filter((item): item is string => Boolean(item)))];

  const productRows =
    skuCandidates.length === 0 && nameCandidates.length === 0
      ? []
      : await prisma.globalTopProduct.findMany({
          where: {
            OR: [
              ...skuCandidates.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })),
              ...nameCandidates.map((name) => ({ name: { equals: name, mode: "insensitive" as const } }))
            ]
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unitPriceNetCzk: true
          }
        });

  const productsBySku = new Map<string, { id: number; name: string; unitPriceNetCzk: Prisma.Decimal | null }>();
  const productsByName = new Map<string, { id: number; name: string; unitPriceNetCzk: Prisma.Decimal | null }>();
  for (const product of productRows) {
    const skuToken = normalizeToken(product.sku);
    const nameToken = normalizeToken(product.name);
    if (skuToken) {
      productsBySku.set(skuToken, { id: product.id, name: product.name, unitPriceNetCzk: product.unitPriceNetCzk });
    }
    if (nameToken) {
      productsByName.set(nameToken, { id: product.id, name: product.name, unitPriceNetCzk: product.unitPriceNetCzk });
    }
  }

  const products = order.items.map((item) => {
    const matchBySku = normalizeToken(item.sku);
    const matchByName = normalizeToken(item.name);
    const productMatch = (matchBySku ? productsBySku.get(matchBySku) : undefined) ?? (matchByName ? productsByName.get(matchByName) : undefined);

    const quantity = item.quantity;
    const unitPriceFromProduct = productMatch?.unitPriceNetCzk ?? null;
    const lineTotal = unitPriceFromProduct ? unitPriceFromProduct.mul(quantity) : null;

    return {
      orderItemId: item.id,
      productId: productMatch?.id ?? null,
      productName: productMatch?.name ?? item.name ?? item.sku ?? "Unknown product",
      sku: item.sku,
      unitPriceFromProductNetCzk: decimalToMoneyOrNull(unitPriceFromProduct),
      quantity: item.quantity.toString(),
      lineTotalNetCzk: decimalToMoneyOrNull(lineTotal)
    };
  });

  res.json({
    order: {
      id: order.id,
      orderId: order.orderId,
      status: order.status,
      importedAt: order.importedAt,
      customer: {
        id: order.customer.id,
        name: order.customer.name
      },
      currentSalesRep: order.customer.assignments[0]?.salesRep ?? null
    },
    products
  });
});

workspaceRouter.get("/categories", async (req, res) => {
  const parsed = categoriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid categories query." });
    return;
  }

  const authUser = req.authUser!;
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);

  const categories = await prisma.catalogCategory.findMany({
    where: parsed.data.name
      ? {
          name: {
            contains: parsed.data.name,
            mode: "insensitive"
          }
        }
      : {},
    orderBy: { name: "asc" }
  });

  const categoryNames = categories.map((category) => category.name);

  const turnoverRows =
    visibleCustomerIds.size === 0 || categoryNames.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["category"],
          where: {
            lineType: "product",
            category: { in: categoryNames },
            order: {
              customerId: { in: [...visibleCustomerIds] }
            }
          },
          _sum: {
            lineNetCzk: true
          }
        });

  const turnoverMap = new Map<string, string>();
  for (const row of turnoverRows) {
    const key = row.category ?? "";
    turnoverMap.set(key, row._sum.lineNetCzk?.toFixed(2) ?? "0.00");
  }

  const topProductsByCategory = await prisma.globalTopProduct.groupBy({
    by: ["categoryName", "isActive"],
    where: {
      categoryName: {
        in: categoryNames
      }
    },
    _count: {
      _all: true
    }
  });

  const topCounts = new Map<string, { all: number; active: number }>();
  for (const row of topProductsByCategory) {
    const key = row.categoryName ?? "";
    const current = topCounts.get(key) ?? { all: 0, active: 0 };
    current.all += row._count._all;
    if (row.isActive) {
      current.active += row._count._all;
    }
    topCounts.set(key, current);
  }

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      turnoverNetCzk: turnoverMap.get(category.name) ?? "0.00",
      topProductsTotal: topCounts.get(category.name)?.all ?? 0,
      topProductsActive: topCounts.get(category.name)?.active ?? 0
    })),
    summary: {
      count: categories.length
    }
  });
});

workspaceRouter.post("/categories", requireRole("admin"), async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid category payload." });
    return;
  }

  try {
    const category = await prisma.catalogCategory.create({
      data: {
        name: parsed.data.name
      }
    });
    res.status(201).json({ category });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Category already exists." });
      return;
    }
    throw error;
  }
});

workspaceRouter.patch("/categories/:categoryId", requireRole("admin"), async (req, res) => {
  const paramParsed = categoryIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid category id." });
    return;
  }

  const bodyParsed = updateCategorySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid category payload." });
    return;
  }

  try {
    const category = await prisma.catalogCategory.update({
      where: { id: paramParsed.data.categoryId },
      data: { name: bodyParsed.data.name }
    });
    res.json({ category });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ message: "Category not found." });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Category already exists." });
      return;
    }
    throw error;
  }
});

workspaceRouter.get("/top-products", async (req, res) => {
  const parsed = topProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid top products query." });
    return;
  }

  const authUser = req.authUser!;
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);
  const { q, category, isActive, limit } = parsed.data;

  const whereClause: Prisma.GlobalTopProductWhereInput = {};
  if (q) {
    whereClause.OR = [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }];
  }
  if (category) {
    whereClause.categoryName = { contains: category, mode: "insensitive" };
  }
  if (isActive === "true") {
    whereClause.isActive = true;
  } else if (isActive === "false") {
    whereClause.isActive = false;
  }

  const products = await prisma.globalTopProduct.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    take: limit
  });

  const skuList = products.map((product) => product.sku).filter((item): item is string => Boolean(item));
  const turnoverRows =
    visibleCustomerIds.size === 0 || skuList.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["sku"],
          where: {
            lineType: "product",
            sku: { in: skuList },
            order: {
              customerId: { in: [...visibleCustomerIds] }
            }
          },
          _sum: {
            lineNetCzk: true
          }
        });

  const turnoverMap = new Map<string, string>();
  for (const row of turnoverRows) {
    const key = row.sku ?? "";
    turnoverMap.set(key, row._sum.lineNetCzk?.toFixed(2) ?? "0.00");
  }

  res.json({
    topProducts: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryName: product.categoryName,
      unitPriceNetCzk: decimalToMoneyOrNull(product.unitPriceNetCzk),
      stockQuantity: product.stockQuantity,
      historicalSalesQty: product.historicalSalesQty,
      incomingFromSupplierQty: product.incomingFromSupplierQty,
      isActive: product.isActive,
      turnoverNetCzk: product.sku ? turnoverMap.get(product.sku) ?? "0.00" : "0.00"
    })),
    summary: {
      count: products.length
    }
  });
});

workspaceRouter.post("/top-products", requireRole("admin"), async (req, res) => {
  const parsed = createTopProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid top product payload." });
    return;
  }

  try {
    const topProduct = await prisma.globalTopProduct.create({
      data: {
        name: parsed.data.name,
        sku: parsed.data.sku ?? null,
        categoryName: parsed.data.categoryName ?? null,
        isActive: parsed.data.isActive ?? true
      }
    });

    res.status(201).json({ topProduct });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Top product name or SKU already exists." });
      return;
    }
    throw error;
  }
});

workspaceRouter.patch("/top-products/:topProductId", async (req, res) => {
  const paramParsed = topProductIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid top product id." });
    return;
  }

  const bodyParsed = updateTopProductSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid top product payload." });
    return;
  }

  try {
    const topProduct = await prisma.globalTopProduct.update({
      where: { id: paramParsed.data.topProductId },
      data: {
        ...(bodyParsed.data.name !== undefined ? { name: bodyParsed.data.name } : {}),
        ...(bodyParsed.data.sku !== undefined ? { sku: bodyParsed.data.sku } : {}),
        ...(bodyParsed.data.categoryName !== undefined ? { categoryName: bodyParsed.data.categoryName } : {}),
        ...(bodyParsed.data.isActive !== undefined ? { isActive: bodyParsed.data.isActive } : {})
      }
    });

    res.json({ topProduct });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ message: "Top product not found." });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Top product name or SKU already exists." });
      return;
    }
    throw error;
  }
});

workspaceRouter.get("/dashboard", async (req, res) => {
  const authUser = req.authUser!;
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);

  const salesReps = await prisma.user.findMany({
    where: {
      role: "sales_rep",
      isActive: true,
      ...(authUser.role === "admin" ? {} : { id: authUser.userId })
    },
    select: {
      id: true,
      name: true,
      email: true
    },
    orderBy: { name: "asc" }
  });
  const repNameMap = new Map(salesReps.map((rep) => [rep.id, rep.name]));

  const activeTopProducts = await prisma.globalTopProduct.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true
    }
  });

  const topBySku = new Map<string, { id: number; name: string }>();
  const topByName = new Map<string, { id: number; name: string }>();
  for (const product of activeTopProducts) {
    const skuToken = normalizeToken(product.sku);
    const nameToken = normalizeToken(product.name);
    if (skuToken) {
      topBySku.set(skuToken, { id: product.id, name: product.name });
    }
    if (nameToken) {
      topByName.set(nameToken, { id: product.id, name: product.name });
    }
  }

  const rows =
    visibleCustomerIds.size === 0
      ? []
      : await prisma.orderItem.findMany({
          where: {
            lineType: "product",
            order: {
              customerId: { in: [...visibleCustomerIds] }
            }
          },
          select: {
            category: true,
            sku: true,
            name: true,
            lineNetCzk: true,
            order: {
              select: {
                customer: {
                  select: {
                    assignments: {
                      where: { endedAt: null },
                      take: 1,
                      select: {
                        salesRepId: true
                      }
                    }
                  }
                }
              }
            }
          }
        });

  let totalTurnover = 0;
  const categoryTotals = new Map<string, number>();
  const categoryByRep = new Map<number, Map<string, number>>();
  const topTotals = new Map<number, { name: string; turnover: number }>();
  const topByRep = new Map<number, Map<number, { name: string; turnover: number }>>();

  for (const row of rows) {
    const value = Number.parseFloat(row.lineNetCzk.toString());
    totalTurnover += value;

    const category = row.category ?? "Uncategorized";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + value);

    const repId = row.order.customer.assignments[0]?.salesRepId ?? null;
    if (repId !== null) {
      const repMap = categoryByRep.get(repId) ?? new Map<string, number>();
      repMap.set(category, (repMap.get(category) ?? 0) + value);
      categoryByRep.set(repId, repMap);
    }

    const skuToken = normalizeToken(row.sku);
    const nameToken = normalizeToken(row.name);
    const matchedTop = (skuToken ? topBySku.get(skuToken) : undefined) ?? (nameToken ? topByName.get(nameToken) : undefined);
    if (!matchedTop) {
      continue;
    }

    const currentTop = topTotals.get(matchedTop.id) ?? { name: matchedTop.name, turnover: 0 };
    currentTop.turnover += value;
    topTotals.set(matchedTop.id, currentTop);

    if (repId !== null) {
      const repTopMap = topByRep.get(repId) ?? new Map<number, { name: string; turnover: number }>();
      const repTop = repTopMap.get(matchedTop.id) ?? { name: matchedTop.name, turnover: 0 };
      repTop.turnover += value;
      repTopMap.set(matchedTop.id, repTop);
      topByRep.set(repId, repTopMap);
    }
  }

  const categoryShareTotal = [...categoryTotals.entries()]
    .map(([category, turnover]) => ({
      category,
      turnoverNetCzk: toMoneyString(turnover),
      sharePct: totalTurnover === 0 ? "0.00" : ((turnover / totalTurnover) * 100).toFixed(2)
    }))
    .sort((left, right) => Number.parseFloat(right.turnoverNetCzk) - Number.parseFloat(left.turnoverNetCzk));

  const categoryShareBySalesRep = salesReps.map((rep) => {
    const repCategories = categoryByRep.get(rep.id) ?? new Map<string, number>();
    const repTotal = [...repCategories.values()].reduce((sum, value) => sum + value, 0);

    return {
      salesRepId: rep.id,
      salesRepName: rep.name,
      totalTurnoverNetCzk: toMoneyString(repTotal),
      categories: [...repCategories.entries()]
        .map(([category, turnover]) => ({
          category,
          turnoverNetCzk: toMoneyString(turnover),
          sharePct: repTotal === 0 ? "0.00" : ((turnover / repTotal) * 100).toFixed(2)
        }))
        .sort((left, right) => Number.parseFloat(right.turnoverNetCzk) - Number.parseFloat(left.turnoverNetCzk))
    };
  });

  const topProductSalesTotal = [...topTotals.entries()]
    .map(([id, row]) => ({
      topProductId: id,
      topProductName: row.name,
      turnoverNetCzk: toMoneyString(row.turnover),
      sharePct: totalTurnover === 0 ? "0.00" : ((row.turnover / totalTurnover) * 100).toFixed(2)
    }))
    .sort((left, right) => Number.parseFloat(right.turnoverNetCzk) - Number.parseFloat(left.turnoverNetCzk));

  const topProductSalesBySalesRep = salesReps.map((rep) => {
    const repTopRows = topByRep.get(rep.id) ?? new Map<number, { name: string; turnover: number }>();
    const repTotal = [...repTopRows.values()].reduce((sum, row) => sum + row.turnover, 0);

    return {
      salesRepId: rep.id,
      salesRepName: repNameMap.get(rep.id) ?? rep.name,
      totalTopProductTurnoverNetCzk: toMoneyString(repTotal),
      products: [...repTopRows.entries()]
        .map(([topProductId, row]) => ({
          topProductId,
          topProductName: row.name,
          turnoverNetCzk: toMoneyString(row.turnover),
          sharePct: repTotal === 0 ? "0.00" : ((row.turnover / repTotal) * 100).toFixed(2)
        }))
        .sort((left, right) => Number.parseFloat(right.turnoverNetCzk) - Number.parseFloat(left.turnoverNetCzk))
    };
  });

  res.json({
    totals: {
      productTurnoverNetCzk: toMoneyString(totalTurnover),
      productLineCount: rows.length,
      activeTopProductsCount: activeTopProducts.length
    },
    categoryShareTotal,
    categoryShareBySalesRep,
    topProductSalesTotal,
    topProductSalesBySalesRep
  });
});
