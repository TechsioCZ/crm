import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../types/auth";

const groupIdParamSchema = z.object({
  groupId: z.coerce.number().int().positive()
});

const customerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive()
});

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scope: z.enum(["global", "private"]).optional(),
  filter: z.object({
    type: z.literal("active_orders_last_months"),
    monthsBack: z.coerce.number().int().min(1).max(60)
  })
});

const createRuleSchema = z.object({
  name: z.string().trim().min(2).max(140),
  scope: z.enum(["global", "private"]).optional(),
  groupId: z.coerce.number().int().positive(),
  comparisonGroupId: z.coerce.number().int().positive().optional(),
  targetType: z.enum(["category", "top_product"]),
  targetValue: z.string().trim().min(1).max(120),
  minPenetrationPct: z.coerce.number().min(0).max(100).default(30),
  isActive: z.boolean().optional()
});

const listRecommendationsQuerySchema = z.object({
  customerId: z.coerce.number().int().positive().optional()
});

type GroupWithOwner = Prisma.CustomerGroupGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        role: true;
        name: true;
        email: true;
      };
    };
  };
}>;

type RuleWithRelations = Prisma.RecommendationRuleGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        role: true;
        name: true;
        email: true;
      };
    };
    group: {
      include: {
        owner: {
          select: {
            id: true;
            role: true;
            name: true;
            email: true;
          };
        };
      };
    };
    comparisonGroup: {
      include: {
        owner: {
          select: {
            id: true;
            role: true;
            name: true;
            email: true;
          };
        };
      };
    };
  };
}>;

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

function monthsBackCutoffUtc(monthsBack: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, now.getUTCDate(), 0, 0, 0, 0));
}

function toPctString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

async function getVisibleCustomerIds(authUser: AuthUser): Promise<Set<number>> {
  if (authUser.role === "admin") {
    const rows = await prisma.customer.findMany({
      select: { id: true }
    });
    return new Set(rows.map((row) => row.id));
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

function canAccessGroup(group: GroupWithOwner, authUser: AuthUser): boolean {
  if (authUser.role === "admin") {
    return true;
  }

  if (group.scope === "global") {
    return true;
  }

  return group.ownerUserId === authUser.userId;
}

function canAccessRule(rule: RuleWithRelations, authUser: AuthUser): boolean {
  if (authUser.role === "admin") {
    return true;
  }

  if (rule.scope === "global") {
    return true;
  }

  return rule.ownerUserId === authUser.userId;
}

async function resolveGroupMemberIds(
  group: GroupWithOwner,
  cache: Map<number, Set<number>>
): Promise<Set<number>> {
  const cached = cache.get(group.id);
  if (cached) {
    return cached;
  }

  const cutoff = monthsBackCutoffUtc(group.monthsBack);
  const baseRows = await prisma.order.findMany({
    where: {
      importedAt: {
        gte: cutoff
      }
    },
    select: {
      customerId: true
    },
    distinct: ["customerId"]
  });

  let memberIds = new Set(baseRows.map((row) => row.customerId));

  if (group.scope === "private" && group.ownerUserId && group.owner?.role === "sales_rep" && memberIds.size > 0) {
    const ownerRows = await prisma.customerAssignment.findMany({
      where: {
        endedAt: null,
        salesRepId: group.ownerUserId,
        customerId: {
          in: [...memberIds]
        }
      },
      select: {
        customerId: true
      },
      distinct: ["customerId"]
    });

    memberIds = new Set(ownerRows.map((row) => row.customerId));
  }

  cache.set(group.id, memberIds);
  return memberIds;
}

async function getRuleTargetBoughtCustomerIds(
  rule: RuleWithRelations,
  customerIds: Set<number>,
  cache: Map<string, Set<number>>
): Promise<Set<number>> {
  const key = `${rule.targetType}|${normalizeToken(rule.targetValue) ?? ""}|${[...customerIds].sort((a, b) => a - b).join(",")}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  if (customerIds.size === 0) {
    const empty = new Set<number>();
    cache.set(key, empty);
    return empty;
  }

  if (rule.targetType === "category") {
    const targetCategory = normalizeToken(rule.targetValue) ?? "";
    const rows = await prisma.orderItem.findMany({
      where: {
        lineType: "product",
        order: {
          customerId: { in: [...customerIds] }
        }
      },
      select: {
        category: true,
        order: {
          select: {
            customerId: true
          }
        }
      }
    });

    const result = new Set<number>();
    for (const row of rows) {
      if (normalizeToken(row.category) === targetCategory) {
        result.add(row.order.customerId);
      }
    }

    cache.set(key, result);
    return result;
  }

  const target = normalizeToken(rule.targetValue) ?? "";
  const topProduct = await prisma.globalTopProduct.findFirst({
    where: {
      isActive: true,
      OR: [{ name: rule.targetValue }, { sku: rule.targetValue }]
    },
    select: {
      name: true,
      sku: true
    }
  });

  const matchName = normalizeToken(topProduct?.name ?? rule.targetValue);
  const matchSku = normalizeToken(topProduct?.sku ?? rule.targetValue);

  const rows = await prisma.orderItem.findMany({
    where: {
      lineType: "product",
      order: {
        customerId: { in: [...customerIds] }
      }
    },
    select: {
      sku: true,
      name: true,
      order: {
        select: {
          customerId: true
        }
      }
    }
  });

  const result = new Set<number>();
  for (const row of rows) {
    const skuToken = normalizeToken(row.sku);
    const nameToken = normalizeToken(row.name);
    if ((matchSku && skuToken === matchSku) || (matchName && nameToken === matchName) || skuToken === target || nameToken === target) {
      result.add(row.order.customerId);
    }
  }

  cache.set(key, result);
  return result;
}

export const recommendationsRouter = Router();

recommendationsRouter.use(requireAuth);

recommendationsRouter.get("/groups", async (req, res) => {
  const authUser = req.authUser!;
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);
  const membershipCache = new Map<number, Set<number>>();

  const groups = await prisma.customerGroup.findMany({
    where:
      authUser.role === "admin"
        ? {}
        : {
            OR: [{ scope: "global" }, { ownerUserId: authUser.userId }]
          },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  const response = [];
  for (const group of groups) {
    if (!canAccessGroup(group, authUser)) {
      continue;
    }

    const allMembers = await resolveGroupMemberIds(group, membershipCache);
    const visibleMembers = [...allMembers].filter((id) => visibleCustomerIds.has(id));

    response.push({
      id: group.id,
      name: group.name,
      scope: group.scope,
      filterType: group.filterType,
      monthsBack: group.monthsBack,
      owner: group.owner,
      totalMembers: allMembers.size,
      visibleMembers: visibleMembers.length
    });
  }

  res.json({ groups: response });
});

recommendationsRouter.post("/groups", async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid group payload." });
    return;
  }

  const authUser = req.authUser!;
  const payload = parsed.data;

  let scope: "global" | "private";
  if (authUser.role === "admin") {
    scope = payload.scope ?? "global";
  } else {
    scope = "private";
    if (payload.scope === "global") {
      res.status(403).json({ message: "Sales rep cannot create a global group." });
      return;
    }
  }

  const created = await prisma.customerGroup.create({
    data: {
      name: payload.name,
      scope,
      ownerUserId: scope === "private" ? authUser.userId : null,
      filterType: payload.filter.type,
      monthsBack: payload.filter.monthsBack
    },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      }
    }
  });

  res.status(201).json({ group: created });
});

recommendationsRouter.get("/groups/:groupId/members", async (req, res) => {
  const paramParsed = groupIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ message: "Invalid group id." });
    return;
  }

  const authUser = req.authUser!;
  const group = await prisma.customerGroup.findUnique({
    where: { id: paramParsed.data.groupId },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!group) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (!canAccessGroup(group, authUser)) {
    res.status(403).json({ message: "Group is not accessible." });
    return;
  }

  const membershipCache = new Map<number, Set<number>>();
  const memberIds = await resolveGroupMemberIds(group, membershipCache);
  const visibleCustomerIds = await getVisibleCustomerIds(authUser);
  const visibleIds = [...memberIds].filter((id) => visibleCustomerIds.has(id));

  const customers = await prisma.customer.findMany({
    where: {
      id: { in: visibleIds }
    },
    select: {
      id: true,
      name: true
    },
    orderBy: { name: "asc" }
  });

  res.json({
    group: {
      id: group.id,
      name: group.name,
      scope: group.scope,
      filterType: group.filterType,
      monthsBack: group.monthsBack,
      owner: group.owner
    },
    totalMembers: memberIds.size,
    visibleMembers: customers.length,
    customers
  });
});

recommendationsRouter.get("/rules", async (req, res) => {
  const authUser = req.authUser!;

  const rules = await prisma.recommendationRule.findMany({
    where:
      authUser.role === "admin"
        ? {}
        : {
            OR: [{ scope: "global" }, { ownerUserId: authUser.userId }]
          },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      },
      group: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      },
      comparisonGroup: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  res.json({
    rules: rules.filter((rule) => canAccessRule(rule, authUser))
  });
});

recommendationsRouter.post("/rules", async (req, res) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid rule payload." });
    return;
  }

  const authUser = req.authUser!;
  const payload = parsed.data;

  let scope: "global" | "private";
  if (authUser.role === "admin") {
    scope = payload.scope ?? "global";
  } else {
    scope = "private";
    if (payload.scope === "global") {
      res.status(403).json({ message: "Sales rep cannot create a global rule." });
      return;
    }
  }

  const targetGroup = await prisma.customerGroup.findUnique({
    where: { id: payload.groupId },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!targetGroup) {
    res.status(404).json({ message: "Target group not found." });
    return;
  }

  if (!canAccessGroup(targetGroup, authUser)) {
    res.status(403).json({ message: "Target group is not accessible." });
    return;
  }

  if (authUser.role === "sales_rep") {
    if (targetGroup.scope !== "private" || targetGroup.ownerUserId !== authUser.userId) {
      res.status(403).json({ message: "Sales rep rule must use own private group." });
      return;
    }
  }

  const comparisonGroupId = payload.comparisonGroupId ?? payload.groupId;
  const comparisonGroup =
    comparisonGroupId === payload.groupId
      ? targetGroup
      : await prisma.customerGroup.findUnique({
          where: { id: comparisonGroupId },
          include: {
            owner: {
              select: {
                id: true,
                role: true,
                name: true,
                email: true
              }
            }
          }
        });

  if (!comparisonGroup) {
    res.status(404).json({ message: "Comparison group not found." });
    return;
  }

  if (!canAccessGroup(comparisonGroup, authUser)) {
    res.status(403).json({ message: "Comparison group is not accessible." });
    return;
  }

  if (authUser.role === "sales_rep") {
    if (comparisonGroup.scope !== "private" || comparisonGroup.ownerUserId !== authUser.userId) {
      res.status(403).json({ message: "Sales rep rule comparison group must be own private group." });
      return;
    }
  }

  const created = await prisma.recommendationRule.create({
    data: {
      name: payload.name,
      scope,
      ownerUserId: scope === "private" ? authUser.userId : null,
      groupId: payload.groupId,
      comparisonGroupId,
      targetType: payload.targetType,
      targetValue: payload.targetValue,
      minPenetrationPct: new Prisma.Decimal(payload.minPenetrationPct),
      isActive: payload.isActive ?? true
    },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      },
      group: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      },
      comparisonGroup: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      }
    }
  });

  res.status(201).json({ rule: created });
});

recommendationsRouter.get("/opportunities", async (req, res) => {
  const authUser = req.authUser!;
  const queryParsed = listRecommendationsQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ message: "Invalid recommendation query." });
    return;
  }

  const visibleCustomerIds = await getVisibleCustomerIds(authUser);
  const specificCustomerId = queryParsed.data.customerId ?? null;
  if (specificCustomerId && !visibleCustomerIds.has(specificCustomerId)) {
    res.status(403).json({ message: "Customer is not visible for current user." });
    return;
  }

  const rules = await prisma.recommendationRule.findMany({
    where: {
      isActive: true,
      ...(authUser.role === "admin"
        ? {}
        : {
            OR: [{ scope: "global" }, { ownerUserId: authUser.userId }]
          })
    },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      },
      group: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      },
      comparisonGroup: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const filteredRules = rules.filter((rule) => canAccessRule(rule, authUser));
  const memberCache = new Map<number, Set<number>>();
  const targetBoughtCache = new Map<string, Set<number>>();
  const recommendationRows: Array<{
    ruleId: number;
    ruleName: string;
    ruleScope: string;
    targetType: string;
    targetValue: string;
    customerId: number;
    customerName: string;
    comparisonPenetrationPct: string;
    minPenetrationPct: string;
  }> = [];

  const customerIdsNeeded = new Set<number>();

  for (const rule of filteredRules) {
    const groupMembers = await resolveGroupMemberIds(rule.group, memberCache);
    const comparisonGroup = rule.comparisonGroup ?? rule.group;
    const comparisonMembers = await resolveGroupMemberIds(comparisonGroup, memberCache);

    const comparisonBought = await getRuleTargetBoughtCustomerIds(rule, comparisonMembers, targetBoughtCache);
    const groupBought = await getRuleTargetBoughtCustomerIds(rule, groupMembers, targetBoughtCache);

    const comparisonTotal = comparisonMembers.size;
    const comparisonBoughtCount = comparisonBought.size;
    const penetration =
      comparisonTotal === 0
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(comparisonBoughtCount).div(comparisonTotal).mul(100);

    if (penetration.lt(rule.minPenetrationPct)) {
      continue;
    }

    for (const customerId of groupMembers) {
      if (groupBought.has(customerId)) {
        continue;
      }

      if (!visibleCustomerIds.has(customerId)) {
        continue;
      }

      if (specificCustomerId && customerId !== specificCustomerId) {
        continue;
      }

      customerIdsNeeded.add(customerId);
      recommendationRows.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleScope: rule.scope,
        targetType: rule.targetType,
        targetValue: rule.targetValue,
        customerId,
        customerName: "",
        comparisonPenetrationPct: toPctString(penetration),
        minPenetrationPct: toPctString(new Prisma.Decimal(rule.minPenetrationPct))
      });
    }
  }

  const customerRows = await prisma.customer.findMany({
    where: {
      id: {
        in: [...customerIdsNeeded]
      }
    },
    select: {
      id: true,
      name: true
    }
  });
  const nameMap = new Map(customerRows.map((row) => [row.id, row.name]));

  const opportunities = recommendationRows
    .map((row) => ({
      ...row,
      customerName: nameMap.get(row.customerId) ?? `Customer ${row.customerId}`
    }))
    .sort((left, right) => {
      const byCustomer = left.customerName.localeCompare(right.customerName);
      if (byCustomer !== 0) {
        return byCustomer;
      }

      return left.ruleName.localeCompare(right.ruleName);
    });

  res.json({
    opportunities,
    summary: {
      visibleRules: filteredRules.length,
      visibleOpportunities: opportunities.length
    }
  });
});

recommendationsRouter.get("/customers/:customerId", async (req, res) => {
  const parsed = customerIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid customer id." });
    return;
  }

  const customerId = parsed.data.customerId;
  const authUser = req.authUser!;

  const visibleCustomerIds = await getVisibleCustomerIds(authUser);
  if (!visibleCustomerIds.has(customerId)) {
    res.status(403).json({ message: "Customer is not visible for current user." });
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true }
  });

  if (!customer) {
    res.status(404).json({ message: "Customer not found." });
    return;
  }

  const proxyReq = {
    ...req,
    query: {
      ...req.query,
      customerId: String(customerId)
    }
  };

  const queryParsed = listRecommendationsQuerySchema.safeParse(proxyReq.query);
  if (!queryParsed.success) {
    res.status(400).json({ message: "Invalid customer recommendation query." });
    return;
  }

  const rules = await prisma.recommendationRule.findMany({
    where: {
      isActive: true,
      ...(authUser.role === "admin"
        ? {}
        : {
            OR: [{ scope: "global" }, { ownerUserId: authUser.userId }]
          })
    },
    include: {
      owner: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true
        }
      },
      group: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      },
      comparisonGroup: {
        include: {
          owner: {
            select: {
              id: true,
              role: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const filteredRules = rules.filter((rule) => canAccessRule(rule, authUser));
  const memberCache = new Map<number, Set<number>>();
  const targetBoughtCache = new Map<string, Set<number>>();
  const customerRecommendations: Array<{
    ruleId: number;
    ruleName: string;
    ruleScope: string;
    targetType: string;
    targetValue: string;
    comparisonPenetrationPct: string;
    minPenetrationPct: string;
  }> = [];

  for (const rule of filteredRules) {
    const groupMembers = await resolveGroupMemberIds(rule.group, memberCache);
    if (!groupMembers.has(customerId)) {
      continue;
    }

    const comparisonGroup = rule.comparisonGroup ?? rule.group;
    const comparisonMembers = await resolveGroupMemberIds(comparisonGroup, memberCache);

    const comparisonBought = await getRuleTargetBoughtCustomerIds(rule, comparisonMembers, targetBoughtCache);
    const groupBought = await getRuleTargetBoughtCustomerIds(rule, groupMembers, targetBoughtCache);

    if (groupBought.has(customerId)) {
      continue;
    }

    const comparisonTotal = comparisonMembers.size;
    const comparisonBoughtCount = comparisonBought.size;
    const penetration =
      comparisonTotal === 0
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(comparisonBoughtCount).div(comparisonTotal).mul(100);

    if (penetration.lt(rule.minPenetrationPct)) {
      continue;
    }

    customerRecommendations.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ruleScope: rule.scope,
      targetType: rule.targetType,
      targetValue: rule.targetValue,
      comparisonPenetrationPct: toPctString(penetration),
      minPenetrationPct: toPctString(new Prisma.Decimal(rule.minPenetrationPct))
    });
  }

  res.json({
    customer,
    recommendations: customerRecommendations
  });
});
