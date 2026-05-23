import { Router } from "express";
import { OrderItemType, Prisma } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

type JsonRecord = Record<string, unknown>;

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const importRunIdParamSchema = z.object({
  importRunId: z.coerce.number().int().positive()
});

const assignPayloadSchema = z.object({
  salesRepId: z.coerce.number().int().positive()
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

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole("admin"));

adminRouter.get("/sales-reps", async (_req, res) => {
  const salesReps = await prisma.user.findMany({
    where: { role: "sales_rep" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true
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
      role: "sales_rep"
    }
  });

  if (!salesRep) {
    res.status(400).json({ message: "Sales rep not found." });
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

  try {
    const parsedXml = xmlParser.parse(parsed.data.xml);
    orderNodes = extractOrderNodes(parsedXml);
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
        totalRecords: 0
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
      totalRecords: orderNodes.length,
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
