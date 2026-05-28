import { Router } from "express";
import { OrderItemType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

type JsonRecord = Record<string, unknown>;

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const salesRepIdParamSchema = z.object({
  salesRepId: z.coerce.number().int().positive()
});

const importRunIdParamSchema = z.object({
  importRunId: z.coerce.number().int().positive()
});

const assignPayloadSchema = z.object({
  salesRepId: z.coerce.number().int().positive()
});

const bulkAssignPayloadSchema = z.object({
  customerIds: z.array(z.coerce.number().int().positive()).min(1).max(1000),
  salesRepId: z.coerce.number().int().positive()
});

const createSalesRepPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(6).max(120)
});

const updateSalesRepPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().optional(),
    password: z.string().min(6).max(120).optional()
  })
  .refine((value) => value.name !== undefined || value.email !== undefined || value.password !== undefined, {
    message: "At least one field must be provided."
  });

const deactivateSalesRepPayloadSchema = z.object({
  reassignToSalesRepId: z.coerce.number().int().positive().optional()
});

const importXmlPayloadSchema = z.object({
  xml: z.string().min(1),
  sourceName: z.string().max(120).optional()
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function scalarToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const objectValue = asRecord(value);
  if (objectValue) {
    return scalarToString(objectValue["#text"]);
  }

  return undefined;
}

function readString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = scalarToString(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function normalizeOrderItemType(raw: string | undefined): OrderItemType {
  if (!raw) {
    return "product";
  }

  const normalized = raw.trim().toLowerCase();

  if (normalized === "product" || normalized === "produkt") {
    return "product";
  }

  if (normalized === "shipping" || normalized === "delivery" || normalized === "doprava") {
    return "shipping";
  }

  if (normalized === "payment" || normalized === "platba") {
    return "payment";
  }

  return "other";
}

function parseDecimal(value: string | undefined): Prisma.Decimal | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n") {
    return false;
  }

  return null;
}

function normalizeLookupToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

async function upsertActiveCustomerAssignment(
  tx: Prisma.TransactionClient,
  customerId: number,
  salesRepId: number,
  assignedById: number
): Promise<boolean> {
  const activeAssignments = await tx.customerAssignment.findMany({
    where: {
      customerId,
      endedAt: null
    },
    orderBy: {
      startedAt: "desc"
    },
    select: {
      id: true,
      salesRepId: true
    }
  });

  if (activeAssignments[0]?.salesRepId === salesRepId && activeAssignments.length <= 1) {
    return false;
  }

  const now = new Date();
  if (activeAssignments.length > 0) {
    await tx.customerAssignment.updateMany({
      where: {
        id: {
          in: activeAssignments.map((assignment) => assignment.id)
        }
      },
      data: {
        endedAt: now
      }
    });
  }

  await tx.customerAssignment.create({
    data: {
      customerId,
      salesRepId,
      assignedById,
      startedAt: now
    }
  });

  return true;
}

function extractOrderNodes(container: unknown): JsonRecord[] {
  const root = asRecord(container);
  if (!root) {
    return [];
  }

  const directOrderList = root["order"];
  if (directOrderList !== undefined) {
    return toArray(directOrderList).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
  }

  const nestedOrders = asRecord(root["orders"]);
  if (nestedOrders) {
    return extractOrderNodes(nestedOrders);
  }

  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (!nested) {
      continue;
    }

    const nestedResult = extractOrderNodes(nested);
    if (nestedResult.length > 0) {
      return nestedResult;
    }
  }

  return [];
}

function extractCustomerNodes(container: unknown): JsonRecord[] {
  const root = asRecord(container);
  if (!root) {
    return [];
  }

  const directRows = root["customer"] ?? root["contact"] ?? root["row"];
  if (directRows !== undefined) {
    return toArray(directRows).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
  }

  const nestedContainers = [asRecord(root["customers"]), asRecord(root["contacts"]), asRecord(root["rows"])];
  for (const nested of nestedContainers) {
    if (!nested) {
      continue;
    }
    const nestedRows = extractCustomerNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (!nested) {
      continue;
    }

    const nestedRows = extractCustomerNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  return [];
}

function extractProductNodes(container: unknown): JsonRecord[] {
  const root = asRecord(container);
  if (!root) {
    return [];
  }

  const directRows = root["product"] ?? root["top_product"] ?? root["row"];
  if (directRows !== undefined) {
    return toArray(directRows).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
  }

  const nestedContainers = [asRecord(root["products"]), asRecord(root["top_products"]), asRecord(root["rows"])];
  for (const nested of nestedContainers) {
    if (!nested) {
      continue;
    }
    const nestedRows = extractProductNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (!nested) {
      continue;
    }

    const nestedRows = extractProductNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  return [];
}

function extractItemNodes(orderNode: JsonRecord): JsonRecord[] {
  const directItems = orderNode["item"];
  if (directItems !== undefined) {
    return toArray(directItems).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
  }

  const containerKeys = ["items", "order_items", "positions", "lines"];
  for (const key of containerKeys) {
    const container = asRecord(orderNode[key]);
    if (!container) {
      continue;
    }

    const itemCandidate = container["item"] ?? container["order_item"] ?? container["line"];
    if (itemCandidate !== undefined) {
      return toArray(itemCandidate).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
    }
  }

  return [];
}

function extractOrderLineNodes(container: unknown): JsonRecord[] {
  const root = asRecord(container);
  if (!root) {
    return [];
  }

  const directRows = root["order_line"] ?? root["line"] ?? root["row"];
  if (directRows !== undefined) {
    return toArray(directRows).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => !!entry);
  }

  const nestedContainers = [asRecord(root["order_lines"]), asRecord(root["lines"]), asRecord(root["rows"]), asRecord(root["orders"])];
  for (const nested of nestedContainers) {
    if (!nested) {
      continue;
    }
    const nestedRows = extractOrderLineNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (!nested) {
      continue;
    }

    const nestedRows = extractOrderLineNodes(nested);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  return [];
}

function buildOrderNodesFromFlatLines(orderLineNodes: JsonRecord[]): JsonRecord[] {
  const grouped = new Map<string, JsonRecord>();
  const missingOrderIdNodes: JsonRecord[] = [];

  for (const lineNode of orderLineNodes) {
    const orderId = readString(lineNode, ["order_id", "orderId", "id"]);
    const itemNode: JsonRecord = {
      type: readString(lineNode, ["type", "line_type", "lineType"]),
      sku: readString(lineNode, ["sku", "product_code"]),
      name: readString(lineNode, ["name", "product_name"]),
      category: readString(lineNode, ["category", "category_name"]),
      quantity: readString(lineNode, ["quantity", "qty"]),
      unit_price_net_czk: readString(lineNode, ["unit_price_net_czk", "unitPriceNetCzk", "unit_price"]),
      line_net_czk: readString(lineNode, ["line_net_czk", "lineNetCzk", "line_total_net_czk"])
    };

    if (!orderId) {
      missingOrderIdNodes.push({
        customer_id: readString(lineNode, ["customer_id", "customerId", "customer"]),
        status: readString(lineNode, ["status", "state"]) ?? "unknown",
        imported_at: readString(lineNode, ["imported_at", "importedAt", "date"]),
        item: [itemNode]
      });
      continue;
    }

    const existing = grouped.get(orderId);
    if (!existing) {
      grouped.set(orderId, {
        order_id: orderId,
        customer_id: readString(lineNode, ["customer_id", "customerId", "customer"]),
        status: readString(lineNode, ["status", "state"]) ?? "unknown",
        imported_at: readString(lineNode, ["imported_at", "importedAt", "date"]),
        item: []
      });
    }

    const orderNode = grouped.get(orderId)!;
    const items = toArray(orderNode.item as JsonRecord[] | JsonRecord | null | undefined);
    const hasSomeItemData = Object.values(itemNode).some((value) => typeof value === "string" && value.trim().length > 0);
    orderNode.item = hasSomeItemData ? [...items, itemNode] : items;
  }

  return [...grouped.values(), ...missingOrderIdNodes];
}

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole("admin"));

adminRouter.post("/sales-reps", async (req, res) => {
  const parsed = createSalesRepPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid sales rep payload." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: "sales_rep",
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true
      }
    });

    res.status(201).json({ salesRep: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Email already exists." });
      return;
    }

    throw error;
  }
});

adminRouter.get("/sales-reps", async (_req, res) => {
  const salesReps = await prisma.user.findMany({
    where: { role: "sales_rep" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true
    }
  });

  const activeCounts = await prisma.customerAssignment.groupBy({
    by: ["salesRepId"],
    where: {
      endedAt: null
    },
    _count: {
      _all: true
    }
  });

  const countMap = new Map(activeCounts.map((row) => [row.salesRepId, row._count._all]));

  const response = salesReps.map((rep) => ({
    ...rep,
    activeCustomerCount: countMap.get(rep.id) ?? 0
  }));

  res.json({ salesReps: response });
});

adminRouter.patch("/sales-reps/:salesRepId", async (req, res) => {
  const paramParsed = salesRepIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid sales rep id." });
    return;
  }

  const bodyParsed = updateSalesRepPayloadSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid sales rep update payload." });
    return;
  }

  const salesRepId = paramParsed.data.salesRepId;
  const updateData: Prisma.UserUpdateInput = {};

  if (bodyParsed.data.name !== undefined) {
    updateData.name = bodyParsed.data.name;
  }
  if (bodyParsed.data.email !== undefined) {
    updateData.email = bodyParsed.data.email.trim().toLowerCase();
  }
  if (bodyParsed.data.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(bodyParsed.data.password, 10);
  }

  const salesRep = await prisma.user.findFirst({
    where: {
      id: salesRepId,
      role: "sales_rep"
    },
    select: {
      id: true
    }
  });
  if (!salesRep) {
    res.status(404).json({ message: "Sales rep not found." });
    return;
  }

  try {
    const updated = await prisma.user.update({
      where: {
        id: salesRepId
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json({ salesRep: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Email already exists." });
      return;
    }

    throw error;
  }
});

adminRouter.post("/sales-reps/:salesRepId/deactivate", async (req, res) => {
  const paramParsed = salesRepIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid sales rep id." });
    return;
  }

  const bodyParsed = deactivateSalesRepPayloadSchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid deactivation payload." });
    return;
  }

  const salesRepId = paramParsed.data.salesRepId;
  const reassignToSalesRepId = bodyParsed.data.reassignToSalesRepId;
  if (reassignToSalesRepId !== undefined && reassignToSalesRepId === salesRepId) {
    res.status(400).json({ message: "Cannot reassign customers to the same sales rep." });
    return;
  }

  const sourceSalesRep = await prisma.user.findFirst({
    where: {
      id: salesRepId,
      role: "sales_rep"
    },
    select: {
      id: true,
      isActive: true
    }
  });
  if (!sourceSalesRep) {
    res.status(404).json({ message: "Sales rep not found." });
    return;
  }

  if (reassignToSalesRepId !== undefined) {
    const targetSalesRep = await prisma.user.findFirst({
      where: {
        id: reassignToSalesRepId,
        role: "sales_rep",
        isActive: true
      },
      select: { id: true }
    });
    if (!targetSalesRep) {
      res.status(400).json({ message: "Replacement sales rep not found or inactive." });
      return;
    }
  }

  const activeAssignments = await prisma.customerAssignment.findMany({
    where: {
      salesRepId,
      endedAt: null
    },
    select: {
      id: true,
      customerId: true
    }
  });

  const activeCustomerIds = [...new Set(activeAssignments.map((row) => row.customerId))];
  const assignedById = req.authUser!.userId;

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    if (activeAssignments.length > 0) {
      await tx.customerAssignment.updateMany({
        where: {
          id: {
            in: activeAssignments.map((row) => row.id)
          }
        },
        data: {
          endedAt: now
        }
      });
    }

    if (reassignToSalesRepId !== undefined && activeCustomerIds.length > 0) {
      await tx.customerAssignment.createMany({
        data: activeCustomerIds.map((customerId) => ({
          customerId,
          salesRepId: reassignToSalesRepId,
          assignedById,
          startedAt: now
        }))
      });
    }

    await tx.user.update({
      where: { id: salesRepId },
      data: { isActive: false }
    });
  });

  res.json({
    message: sourceSalesRep.isActive ? "Sales rep deactivated." : "Sales rep remains inactive.",
    endedAssignments: activeCustomerIds.length,
    reassignedAssignments: reassignToSalesRepId ? activeCustomerIds.length : 0
  });
});

adminRouter.post("/sales-reps/:salesRepId/reactivate", async (req, res) => {
  const paramParsed = salesRepIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid sales rep id." });
    return;
  }

  const salesRep = await prisma.user.findFirst({
    where: {
      id: paramParsed.data.salesRepId,
      role: "sales_rep"
    },
    select: {
      id: true
    }
  });
  if (!salesRep) {
    res.status(404).json({ message: "Sales rep not found." });
    return;
  }

  const updated = await prisma.user.update({
    where: {
      id: paramParsed.data.salesRepId
    },
    data: {
      isActive: true
    },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true
    }
  });

  res.json({
    message: "Sales rep reactivated.",
    salesRep: updated
  });
});

adminRouter.get("/customers", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
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

  const response = customers.map((customer) => {
    const currentAssignment = customer.assignments.find((assignment) => assignment.endedAt === null) ?? null;

    return {
      id: customer.id,
      name: customer.name,
      currentAssignment,
      assignmentHistory: customer.assignments
    };
  });

  res.json({ customers: response });
});

adminRouter.post("/customers/:customerId/assign", async (req, res) => {
  const paramParsed = customerIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const bodyParsed = assignPayloadSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid assignment payload." });
    return;
  }

  const customerId = paramParsed.data.customerId;
  const salesRepId = bodyParsed.data.salesRepId;
  const assignedById = req.authUser!.userId;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const salesRep = await prisma.user.findFirst({
    where: {
      id: salesRepId,
      role: "sales_rep",
      isActive: true
    }
  });

  if (!salesRep) {
    res.status(400).json({ message: "Sales rep not found or inactive." });
    return;
  }

  try {
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const activeAssignment = await tx.customerAssignment.findFirst({
        where: {
          customerId,
          endedAt: null
        },
        orderBy: {
          startedAt: "desc"
        }
      });

      if (activeAssignment?.salesRepId === salesRepId) {
        return {
          changed: false,
          activeAssignmentId: activeAssignment.id
        };
      }

      if (activeAssignment) {
        await tx.customerAssignment.update({
          where: { id: activeAssignment.id },
          data: { endedAt: now }
        });
      }

      const created = await tx.customerAssignment.create({
        data: {
          customerId,
          salesRepId,
          assignedById,
          startedAt: now
        }
      });

      return {
        changed: true,
        activeAssignmentId: created.id
      };
    });

    const customerWithAssignments = await prisma.customer.findUniqueOrThrow({
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

    const currentAssignment =
      customerWithAssignments.assignments.find((assignment) => assignment.endedAt === null) ?? null;

    res.json({
      changed: result.changed,
      customer: {
        id: customerWithAssignments.id,
        name: customerWithAssignments.name,
        currentAssignment,
        assignmentHistory: customerWithAssignments.assignments
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "Customer already has an active assignment." });
      return;
    }

    throw error;
  }
});

adminRouter.post("/customers/assign-bulk", async (req, res) => {
  const bodyParsed = bulkAssignPayloadSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ message: "Invalid bulk assignment payload." });
    return;
  }

  const assignedById = req.authUser!.userId;
  const salesRepId = bodyParsed.data.salesRepId;
  const customerIds = [...new Set(bodyParsed.data.customerIds)];

  const salesRep = await prisma.user.findFirst({
    where: {
      id: salesRepId,
      role: "sales_rep",
      isActive: true
    },
    select: {
      id: true
    }
  });
  if (!salesRep) {
    res.status(400).json({ message: "Sales rep not found or inactive." });
    return;
  }

  const existingCustomers = await prisma.customer.findMany({
    where: {
      id: {
        in: customerIds
      }
    },
    select: {
      id: true
    }
  });
  const existingCustomerIds = new Set(existingCustomers.map((row) => row.id));
  const missingCustomerIds = customerIds.filter((id) => !existingCustomerIds.has(id));
  if (missingCustomerIds.length > 0) {
    res.status(400).json({
      message: `Some customers were not found: ${missingCustomerIds.slice(0, 10).join(", ")}`
    });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    let changed = 0;
    let unchanged = 0;

    for (const customerId of customerIds) {
      const activeAssignments = await tx.customerAssignment.findMany({
        where: {
          customerId,
          endedAt: null
        },
        orderBy: {
          startedAt: "desc"
        },
        select: {
          id: true,
          salesRepId: true
        }
      });

      if (activeAssignments[0]?.salesRepId === salesRepId) {
        unchanged += 1;
        continue;
      }

      if (activeAssignments.length > 0) {
        await tx.customerAssignment.updateMany({
          where: {
            id: {
              in: activeAssignments.map((assignment) => assignment.id)
            }
          },
          data: {
            endedAt: now
          }
        });
      }

      await tx.customerAssignment.create({
        data: {
          customerId,
          salesRepId,
          assignedById,
          startedAt: now
        }
      });
      changed += 1;
    }

    return { changed, unchanged };
  });

  res.json({
    changed: result.changed,
    unchanged: result.unchanged,
    totalRequested: customerIds.length,
    message: `Bulk assignment done (${result.changed} changed, ${result.unchanged} unchanged).`
  });
});

adminRouter.post("/imports/customers/xml", async (req, res) => {
  const parsed = importXmlPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid XML import payload." });
    return;
  }

  const sourceName = parsed.data.sourceName?.trim() || "manual-customers-xml";

  const importRun = await prisma.importRun.create({
    data: {
      sourceName,
      triggeredById: req.authUser?.userId ?? null,
      startedAt: new Date()
    }
  });

  let customerNodes: JsonRecord[] = [];

  try {
    const parsedXml = xmlParser.parse(parsed.data.xml);
    customerNodes = extractCustomerNodes(parsedXml);
  } catch {
    await prisma.importRunError.create({
      data: {
        importRunId: importRun.id,
        recordIndex: 1,
        message: "XML document is not valid."
      }
    });

    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: 0,
        errorRecords: 1
      }
    });

    res.status(400).json({
      message: "XML parsing failed.",
      run: finishedRun
    });
    return;
  }

  if (customerNodes.length === 0) {
    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: 0
      }
    });

    res.json({
      message: "Import completed. No customer records were found in XML.",
      run: finishedRun,
      createdCustomerIds: [],
      updatedCustomerIds: [],
      errors: []
    });
    return;
  }

  const errors: Array<{
    recordIndex: number;
    orderIdValue: string | null;
    customerIdValue: string | null;
    message: string;
    rawRecord?: Prisma.InputJsonValue;
  }> = [];

  const createdCustomerIds: number[] = [];
  const updatedCustomerIds: number[] = [];
  const autoAssignedCustomerIds: number[] = [];
  let hasExplicitCustomerId = false;
  const assignedById = req.authUser!.userId;

  const activeSalesReps = await prisma.user.findMany({
    where: {
      role: "sales_rep",
      isActive: true
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  const salesRepById = new Map(activeSalesReps.map((rep) => [rep.id, rep.id] as const));
  const salesRepByEmail = new Map(
    activeSalesReps
      .map((rep) => [normalizeLookupToken(rep.email), rep.id] as const)
      .filter((entry): entry is [string, number] => entry[0] !== null)
  );
  const salesRepByName = new Map(
    activeSalesReps
      .map((rep) => [normalizeLookupToken(rep.name), rep.id] as const)
      .filter((entry): entry is [string, number] => entry[0] !== null)
  );

  for (const [index, customerNode] of customerNodes.entries()) {
    const recordIndex = index + 1;
    const customerIdRaw = readString(customerNode, ["customer_id", "customerId", "id"]) ?? null;
    const customerName = readString(customerNode, ["name", "customer_name"]) ?? null;
    const salesRepIdRaw = readString(customerNode, ["sales_rep_id", "salesRepId", "salesman_id"]) ?? null;
    const salesRepEmailRaw = readString(customerNode, ["sales_rep_email", "salesRepEmail", "salesman_email"]) ?? null;
    const salesRepNameRaw = readString(customerNode, ["sales_rep_name", "salesRepName", "salesman_name", "salesman"]) ?? null;

    if (!customerName) {
      errors.push({
        recordIndex,
        orderIdValue: null,
        customerIdValue: customerIdRaw,
        message: "Missing required customer name.",
        rawRecord: customerNode as Prisma.InputJsonValue
      });
      continue;
    }

    const hasSalesRepAssignmentRequest = Boolean(
      normalizeLookupToken(salesRepIdRaw) ?? normalizeLookupToken(salesRepEmailRaw) ?? normalizeLookupToken(salesRepNameRaw)
    );
    let resolvedSalesRepId: number | null = null;
    if (hasSalesRepAssignmentRequest) {
      if (salesRepIdRaw) {
        const parsedSalesRepId = parsePositiveInteger(salesRepIdRaw);
        if (parsedSalesRepId === null) {
          errors.push({
            recordIndex,
            orderIdValue: customerName,
            customerIdValue: customerIdRaw,
            message: "sales_rep_id must be a positive integer.",
            rawRecord: customerNode as Prisma.InputJsonValue
          });
          continue;
        }

        resolvedSalesRepId = salesRepById.get(parsedSalesRepId) ?? null;
      } else {
        const salesRepEmailToken = normalizeLookupToken(salesRepEmailRaw);
        if (salesRepEmailToken) {
          resolvedSalesRepId = salesRepByEmail.get(salesRepEmailToken) ?? null;
        } else {
          const salesRepNameToken = normalizeLookupToken(salesRepNameRaw);
          if (salesRepNameToken) {
            resolvedSalesRepId = salesRepByName.get(salesRepNameToken) ?? null;
          }
        }
      }

      if (resolvedSalesRepId === null) {
        errors.push({
          recordIndex,
          orderIdValue: customerName,
          customerIdValue: customerIdRaw,
          message: "Sales rep not found or inactive. Use sales_rep_id, sales_rep_email, or sales_rep_name.",
          rawRecord: customerNode as Prisma.InputJsonValue
        });
        continue;
      }
    }

    const parsedCustomerId = parsePositiveInteger(customerIdRaw ?? undefined);
    if (customerIdRaw && parsedCustomerId === null) {
      errors.push({
        recordIndex,
        orderIdValue: customerName,
        customerIdValue: customerIdRaw,
        message: "customer_id must be a positive integer.",
        rawRecord: customerNode as Prisma.InputJsonValue
      });
      continue;
    }

    try {
      if (parsedCustomerId !== null) {
        hasExplicitCustomerId = true;
        const existingById = await prisma.customer.findUnique({
          where: { id: parsedCustomerId },
          select: { id: true, name: true }
        });

        if (existingById) {
          if (existingById.name !== customerName) {
            await prisma.customer.update({
              where: { id: parsedCustomerId },
              data: { name: customerName }
            });
          }
          if (resolvedSalesRepId !== null) {
            const changed = await prisma.$transaction((tx) =>
              upsertActiveCustomerAssignment(tx, parsedCustomerId, resolvedSalesRepId!, assignedById)
            );
            if (changed) {
              autoAssignedCustomerIds.push(parsedCustomerId);
            }
          }
          updatedCustomerIds.push(parsedCustomerId);
          continue;
        }

        const created = await prisma.$transaction(async (tx) => {
          const createdCustomer = await tx.customer.create({
            data: {
              id: parsedCustomerId,
              name: customerName
            },
            select: { id: true }
          });

          let assignmentChanged = false;
          if (resolvedSalesRepId !== null) {
            assignmentChanged = await upsertActiveCustomerAssignment(tx, createdCustomer.id, resolvedSalesRepId, assignedById);
          }

          return {
            id: createdCustomer.id,
            assignmentChanged
          };
        });
        createdCustomerIds.push(created.id);
        if (created.assignmentChanged) {
          autoAssignedCustomerIds.push(created.id);
        }
        continue;
      }

      const existingByName = await prisma.customer.findUnique({
        where: { name: customerName },
        select: { id: true }
      });

      if (existingByName) {
        if (resolvedSalesRepId !== null) {
          const changed = await prisma.$transaction((tx) =>
            upsertActiveCustomerAssignment(tx, existingByName.id, resolvedSalesRepId!, assignedById)
          );
          if (changed) {
            autoAssignedCustomerIds.push(existingByName.id);
          }
        }
        updatedCustomerIds.push(existingByName.id);
        continue;
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdCustomer = await tx.customer.create({
          data: {
            name: customerName
          },
          select: { id: true }
        });

        let assignmentChanged = false;
        if (resolvedSalesRepId !== null) {
          assignmentChanged = await upsertActiveCustomerAssignment(tx, createdCustomer.id, resolvedSalesRepId, assignedById);
        }

        return {
          id: createdCustomer.id,
          assignmentChanged
        };
      });
      createdCustomerIds.push(created.id);
      if (created.assignmentChanged) {
        autoAssignedCustomerIds.push(created.id);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        errors.push({
          recordIndex,
          orderIdValue: customerName,
          customerIdValue: customerIdRaw,
          message: "Customer name or id already exists.",
          rawRecord: customerNode as Prisma.InputJsonValue
        });
        continue;
      }
      throw error;
    }
  }

  if (hasExplicitCustomerId) {
    await prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('"Customer"', 'id'),
        COALESCE((SELECT MAX(id) FROM "Customer"), 1),
        true
      )
    `;
  }

  if (errors.length > 0) {
    await prisma.importRunError.createMany({
      data: errors.map((error) => ({
        importRunId: importRun.id,
        recordIndex: error.recordIndex,
        orderIdValue: error.orderIdValue,
        customerIdValue: error.customerIdValue,
        message: error.message,
        rawRecord: error.rawRecord ?? Prisma.JsonNull
      }))
    });
  }

  const finishedRun = await prisma.importRun.update({
    where: { id: importRun.id },
    data: {
      finishedAt: new Date(),
      totalRecords: customerNodes.length,
      createdOrders: createdCustomerIds.length,
      updatedOrders: updatedCustomerIds.length,
      errorRecords: errors.length
    }
  });

  res.json({
    message: "Customer import completed.",
    run: finishedRun,
    createdCustomerIds,
    updatedCustomerIds,
    autoAssignedCustomerIds,
    errors
  });
});

adminRouter.post("/imports/products/xml", async (req, res) => {
  const parsed = importXmlPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid XML import payload." });
    return;
  }

  const sourceName = parsed.data.sourceName?.trim() || "manual-products-xml";

  const importRun = await prisma.importRun.create({
    data: {
      sourceName,
      triggeredById: req.authUser?.userId ?? null,
      startedAt: new Date()
    }
  });

  let productNodes: JsonRecord[] = [];

  try {
    const parsedXml = xmlParser.parse(parsed.data.xml);
    productNodes = extractProductNodes(parsedXml);
  } catch {
    await prisma.importRunError.create({
      data: {
        importRunId: importRun.id,
        recordIndex: 1,
        message: "XML document is not valid."
      }
    });

    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: 0,
        errorRecords: 1
      }
    });

    res.status(400).json({
      message: "XML parsing failed.",
      run: finishedRun
    });
    return;
  }

  if (productNodes.length === 0) {
    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: 0
      }
    });

    res.json({
      message: "Import completed. No product records were found in XML.",
      run: finishedRun,
      createdProductIds: [],
      updatedProductIds: [],
      errors: []
    });
    return;
  }

  const importedCategoryNames = [
    ...new Set(
      productNodes
        .map((productNode) => readString(productNode, ["category_name", "category"]))
        .filter((name): name is string => Boolean(name && name.trim().length > 0))
    )
  ];

  const createdCategoryNames: string[] = [];
  if (importedCategoryNames.length > 0) {
    const existingCategories = await prisma.catalogCategory.findMany({
      where: {
        name: {
          in: importedCategoryNames
        }
      },
      select: {
        name: true
      }
    });

    const existingCategorySet = new Set(existingCategories.map((category) => category.name));
    const missingCategoryNames = importedCategoryNames.filter((name) => !existingCategorySet.has(name));
    if (missingCategoryNames.length > 0) {
      await prisma.catalogCategory.createMany({
        data: missingCategoryNames.map((name) => ({ name })),
        skipDuplicates: true
      });
      createdCategoryNames.push(...missingCategoryNames);
    }
  }

  const errors: Array<{
    recordIndex: number;
    orderIdValue: string | null;
    customerIdValue: string | null;
    message: string;
    rawRecord?: Prisma.InputJsonValue;
  }> = [];

  const createdProductIds: number[] = [];
  const updatedProductIds: number[] = [];
  let hasExplicitProductId = false;

  for (const [index, productNode] of productNodes.entries()) {
    const recordIndex = index + 1;
    const productIdRaw = readString(productNode, ["product_id", "top_product_id", "id"]) ?? null;
    const skuRaw = readString(productNode, ["sku", "product_code"]) ?? null;
    const nameRaw = readString(productNode, ["name", "product_name"]) ?? null;
    const categoryName = readString(productNode, ["category_name", "category"]) ?? null;
    const unitPriceRaw = readString(productNode, ["unit_price_net_czk", "unitPriceNetCzk", "unit_price"]);
    const stockRaw = readString(productNode, ["stock_quantity", "stock_qty", "stock"]);
    const historicalSalesRaw = readString(productNode, ["historical_sales_qty", "historicalSalesQty"]);
    const incomingRaw = readString(productNode, ["incoming_from_supplier_qty", "incomingFromSupplierQty", "incoming"]);
    const isActiveRaw = readString(productNode, ["is_active", "isActive", "active"]);

    const parsedProductId = parsePositiveInteger(productIdRaw ?? undefined);
    if (productIdRaw && parsedProductId === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "product_id must be a positive integer.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    const parsedUnitPrice = parseDecimal(unitPriceRaw);
    if (unitPriceRaw && parsedUnitPrice === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "unit_price_net_czk must be a valid decimal number.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    const parsedStock = parseOptionalInteger(stockRaw);
    if (stockRaw && parsedStock === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "stock_quantity must be a valid integer number.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    const parsedHistoricalSales = parseOptionalInteger(historicalSalesRaw);
    if (historicalSalesRaw && parsedHistoricalSales === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "historical_sales_qty must be a valid integer number.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    const parsedIncoming = parseOptionalInteger(incomingRaw);
    if (incomingRaw && parsedIncoming === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "incoming_from_supplier_qty must be a valid integer number.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    const parsedIsActive = parseOptionalBoolean(isActiveRaw);
    if (isActiveRaw && parsedIsActive === null) {
      errors.push({
        recordIndex,
        orderIdValue: skuRaw ?? nameRaw,
        customerIdValue: null,
        message: "is_active must be true/false (or yes/no, 1/0).",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    if (!skuRaw && !nameRaw && parsedProductId === null) {
      errors.push({
        recordIndex,
        orderIdValue: null,
        customerIdValue: null,
        message: "Each product row needs at least one identifier: product_id, sku, or name.",
        rawRecord: productNode as Prisma.InputJsonValue
      });
      continue;
    }

    try {
      let existingProduct:
        | {
            id: number;
          }
        | null = null;

      if (parsedProductId !== null) {
        hasExplicitProductId = true;
        existingProduct = await prisma.globalTopProduct.findUnique({
          where: { id: parsedProductId },
          select: { id: true }
        });
      }

      if (!existingProduct && skuRaw) {
        existingProduct = await prisma.globalTopProduct.findUnique({
          where: { sku: skuRaw },
          select: { id: true }
        });
      }

      if (!existingProduct && nameRaw) {
        existingProduct = await prisma.globalTopProduct.findUnique({
          where: { name: nameRaw },
          select: { id: true }
        });
      }

      const productData: Prisma.GlobalTopProductUncheckedCreateInput = {
        ...(parsedProductId !== null ? { id: parsedProductId } : {}),
        name: nameRaw ?? (skuRaw ? skuRaw : `Imported-${recordIndex}`),
        sku: skuRaw,
        categoryName,
        unitPriceNetCzk: parsedUnitPrice,
        stockQuantity: parsedStock,
        historicalSalesQty: parsedHistoricalSales,
        incomingFromSupplierQty: parsedIncoming,
        isActive: parsedIsActive ?? true
      };

      if (existingProduct) {
        const updateData: Prisma.GlobalTopProductUncheckedUpdateInput = {
          ...(nameRaw ? { name: nameRaw } : {}),
          ...(skuRaw !== null ? { sku: skuRaw } : {}),
          ...(categoryName !== null ? { categoryName } : {}),
          ...(unitPriceRaw !== undefined ? { unitPriceNetCzk: parsedUnitPrice } : {}),
          ...(stockRaw !== undefined ? { stockQuantity: parsedStock } : {}),
          ...(historicalSalesRaw !== undefined ? { historicalSalesQty: parsedHistoricalSales } : {}),
          ...(incomingRaw !== undefined ? { incomingFromSupplierQty: parsedIncoming } : {}),
          ...(parsedIsActive !== null ? { isActive: parsedIsActive } : {})
        };

        await prisma.globalTopProduct.update({
          where: { id: existingProduct.id },
          data: updateData
        });

        updatedProductIds.push(existingProduct.id);
      } else {
        if (!nameRaw) {
          errors.push({
            recordIndex,
            orderIdValue: skuRaw ?? null,
            customerIdValue: null,
            message: "name is required when creating a new product.",
            rawRecord: productNode as Prisma.InputJsonValue
          });
          continue;
        }

        const created = await prisma.globalTopProduct.create({
          data: productData,
          select: { id: true }
        });
        createdProductIds.push(created.id);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        errors.push({
          recordIndex,
          orderIdValue: skuRaw ?? nameRaw,
          customerIdValue: null,
          message: "Product name or SKU already exists.",
          rawRecord: productNode as Prisma.InputJsonValue
        });
        continue;
      }
      throw error;
    }
  }

  if (hasExplicitProductId) {
    await prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('"GlobalTopProduct"', 'id'),
        COALESCE((SELECT MAX(id) FROM "GlobalTopProduct"), 1),
        true
      )
    `;
  }

  if (errors.length > 0) {
    await prisma.importRunError.createMany({
      data: errors.map((error) => ({
        importRunId: importRun.id,
        recordIndex: error.recordIndex,
        orderIdValue: error.orderIdValue,
        customerIdValue: error.customerIdValue,
        message: error.message,
        rawRecord: error.rawRecord ?? Prisma.JsonNull
      }))
    });
  }

  const finishedRun = await prisma.importRun.update({
    where: { id: importRun.id },
    data: {
      finishedAt: new Date(),
      totalRecords: productNodes.length,
      createdOrders: createdProductIds.length,
      updatedOrders: updatedProductIds.length,
      errorRecords: errors.length
    }
  });

  res.json({
    message: "Product import completed.",
    run: finishedRun,
    createdCategoryNames,
    createdProductIds,
    updatedProductIds,
    errors
  });
});

adminRouter.get("/imports", async (_req, res) => {
  const imports = await prisma.importRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      triggeredBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      errors: {
        orderBy: { recordIndex: "asc" },
        take: 5,
        select: {
          id: true,
          recordIndex: true,
          orderIdValue: true,
          customerIdValue: true,
          message: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          errors: true
        }
      }
    }
  });

  res.json({
    imports: imports.map((item) => ({
      id: item.id,
      sourceName: item.sourceName,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      totalRecords: item.totalRecords,
      createdOrders: item.createdOrders,
      updatedOrders: item.updatedOrders,
      errorRecords: item.errorRecords,
      triggeredBy: item.triggeredBy,
      sampleErrors: item.errors,
      totalErrorDetails: item._count.errors
    }))
  });
});

adminRouter.get("/imports/:importRunId", async (req, res) => {
  const parsed = importRunIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid import run id." });
    return;
  }

  const importRun = await prisma.importRun.findUnique({
    where: { id: parsed.data.importRunId },
    include: {
      triggeredBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      errors: {
        orderBy: { recordIndex: "asc" }
      }
    }
  });

  if (!importRun) {
    res.status(404).json({ message: "Import run not found." });
    return;
  }

  res.json({ importRun });
});

adminRouter.post("/imports/orders/xml", async (req, res) => {
  const parsed = importXmlPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid XML import payload." });
    return;
  }

  const sourceName = parsed.data.sourceName?.trim() || "manual-xml";

  const importRun = await prisma.importRun.create({
    data: {
      sourceName,
      triggeredById: req.authUser?.userId ?? null,
      startedAt: new Date()
    }
  });

  let orderNodes: JsonRecord[] = [];
  let totalSourceRecords = 0;

  try {
    const parsedXml = xmlParser.parse(parsed.data.xml);
    orderNodes = extractOrderNodes(parsedXml);
    totalSourceRecords = orderNodes.length;

    if (orderNodes.length === 0) {
      const orderLineNodes = extractOrderLineNodes(parsedXml);
      if (orderLineNodes.length > 0) {
        orderNodes = buildOrderNodesFromFlatLines(orderLineNodes);
        totalSourceRecords = orderLineNodes.length;
      }
    }
  } catch {
    await prisma.importRunError.create({
      data: {
        importRunId: importRun.id,
        recordIndex: 1,
        message: "XML document is not valid."
      }
    });

    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: 0,
        errorRecords: 1
      }
    });

    res.status(400).json({
      message: "XML parsing failed.",
      run: finishedRun
    });
    return;
  }

  if (orderNodes.length === 0) {
    const finishedRun = await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        finishedAt: new Date(),
        totalRecords: totalSourceRecords
      }
    });

    res.json({
      message: "Import completed. No order records were found in XML.",
      run: finishedRun,
      createdOrderIds: [],
      updatedOrderIds: [],
      errors: []
    });
    return;
  }

  const customerIdCandidates = new Set<number>();
  for (const orderNode of orderNodes) {
    const customerIdRaw = readString(orderNode, ["customer_id", "customerId", "customer"]);
    const customerId = customerIdRaw ? Number.parseInt(customerIdRaw, 10) : Number.NaN;
    if (Number.isInteger(customerId) && customerId > 0) {
      customerIdCandidates.add(customerId);
    }
  }

  const customerRows = await prisma.customer.findMany({
    where: { id: { in: [...customerIdCandidates] } },
    select: { id: true }
  });

  const customerIdSet = new Set(customerRows.map((item) => item.id));

  const errors: Array<{
    recordIndex: number;
    orderIdValue: string | null;
    customerIdValue: string | null;
    message: string;
    rawRecord?: Prisma.InputJsonValue;
  }> = [];

  const createdOrderIds: string[] = [];
  const updatedOrderIds: string[] = [];

  for (const [index, orderNode] of orderNodes.entries()) {
    const recordIndex = index + 1;

    const orderId = readString(orderNode, ["order_id", "orderId", "id"]) ?? null;
    const customerIdRaw = readString(orderNode, ["customer_id", "customerId", "customer"]) ?? null;
    const status = readString(orderNode, ["status", "state"]) ?? "unknown";
    const importedAtRaw = readString(orderNode, ["imported_at", "importedAt", "date"]) ?? null;

    if (!orderId) {
      errors.push({
        recordIndex,
        orderIdValue: null,
        customerIdValue: customerIdRaw,
        message: "Missing required order_id.",
        rawRecord: orderNode as Prisma.InputJsonValue
      });
      continue;
    }

    if (!customerIdRaw) {
      errors.push({
        recordIndex,
        orderIdValue: orderId,
        customerIdValue: null,
        message: "Missing required customer_id.",
        rawRecord: orderNode as Prisma.InputJsonValue
      });
      continue;
    }

    const customerId = Number.parseInt(customerIdRaw, 10);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      errors.push({
        recordIndex,
        orderIdValue: orderId,
        customerIdValue: customerIdRaw,
        message: "customer_id must be a positive integer.",
        rawRecord: orderNode as Prisma.InputJsonValue
      });
      continue;
    }

    if (!customerIdSet.has(customerId)) {
      errors.push({
        recordIndex,
        orderIdValue: orderId,
        customerIdValue: customerIdRaw,
        message: `Customer ${customerId} does not exist.`,
        rawRecord: orderNode as Prisma.InputJsonValue
      });
      continue;
    }

    const importedAtDate = importedAtRaw ? new Date(importedAtRaw) : new Date();
    const importedAt = Number.isNaN(importedAtDate.getTime()) ? new Date() : importedAtDate;

    const itemNodes = extractItemNodes(orderNode);

    const parsedItems: Array<{
      lineType: OrderItemType;
      sku: string | null;
      name: string | null;
      category: string | null;
      quantity: Prisma.Decimal;
      unitPriceNetCzk: Prisma.Decimal;
      lineNetCzk: Prisma.Decimal;
    }> = [];

    for (const itemNode of itemNodes) {
      const typeRaw = readString(itemNode, ["type", "line_type", "lineType"]);
      const quantityRaw = readString(itemNode, ["quantity", "qty"]);
      const unitPriceRaw = readString(itemNode, ["unit_price_net_czk", "unitPriceNetCzk", "unit_price"]);
      const lineNetRaw = readString(itemNode, ["line_net_czk", "lineNetCzk", "line_total_net_czk"]);

      const quantity = parseDecimal(quantityRaw) ?? new Prisma.Decimal(1);
      const unitPriceNetCzk = parseDecimal(unitPriceRaw) ?? new Prisma.Decimal(0);
      const lineNetCzk = parseDecimal(lineNetRaw) ?? quantity.mul(unitPriceNetCzk);

      parsedItems.push({
        lineType: normalizeOrderItemType(typeRaw),
        sku: readString(itemNode, ["sku", "product_code"]) ?? null,
        name: readString(itemNode, ["name", "product_name"]) ?? null,
        category: readString(itemNode, ["category", "category_name"]) ?? null,
        quantity,
        unitPriceNetCzk,
        lineNetCzk
      });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { orderId },
      select: { id: true }
    });

    if (existingOrder) {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: existingOrder.id },
          data: {
            customerId,
            status,
            importedAt
          }
        });

        await tx.orderItem.deleteMany({
          where: {
            orderDbId: existingOrder.id
          }
        });

        if (parsedItems.length > 0) {
          await tx.orderItem.createMany({
            data: parsedItems.map((item) => ({
              orderDbId: existingOrder.id,
              lineType: item.lineType,
              sku: item.sku,
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              unitPriceNetCzk: item.unitPriceNetCzk,
              lineNetCzk: item.lineNetCzk
            }))
          });
        }
      });

      updatedOrderIds.push(orderId);
      continue;
    }

    await prisma.order.create({
      data: {
        orderId,
        customerId,
        status,
        importedAt,
        items: {
          create: parsedItems.map((item) => ({
            lineType: item.lineType,
            sku: item.sku,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unitPriceNetCzk: item.unitPriceNetCzk,
            lineNetCzk: item.lineNetCzk
          }))
        }
      }
    });

    createdOrderIds.push(orderId);
  }

  if (errors.length > 0) {
    await prisma.importRunError.createMany({
      data: errors.map((error) => ({
        importRunId: importRun.id,
        recordIndex: error.recordIndex,
        orderIdValue: error.orderIdValue,
        customerIdValue: error.customerIdValue,
        message: error.message,
        rawRecord: error.rawRecord ?? Prisma.JsonNull
      }))
    });
  }

  const finishedRun = await prisma.importRun.update({
    where: { id: importRun.id },
    data: {
      finishedAt: new Date(),
      totalRecords: totalSourceRecords,
      createdOrders: createdOrderIds.length,
      updatedOrders: updatedOrderIds.length,
      errorRecords: errors.length
    }
  });

  res.json({
    message: "Import completed.",
    run: finishedRun,
    createdOrderIds,
    updatedOrderIds,
    errors
  });
});
