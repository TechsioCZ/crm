import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const assignPayloadSchema = z.object({
  salesRepId: z.coerce.number().int().positive()
});

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
