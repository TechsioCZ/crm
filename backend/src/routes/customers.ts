import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

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

customersRouter.get("/:customerId", async (req, res) => {
  const parsed = customerIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const authUser = req.authUser!;
  const customerId = parsed.data.customerId;

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
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const currentAssignment = customer.assignments.find((item) => item.endedAt === null) ?? null;

  if (authUser.role === "sales_rep") {
    if (!currentAssignment || currentAssignment.salesRepId !== authUser.userId) {
      res.status(403).json({ message: "You do not have access to this customer." });
      return;
    }
  }

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      currentAssignment,
      assignmentHistory: customer.assignments
    }
  });
});
