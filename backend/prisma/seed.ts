import "dotenv/config";
import bcrypt from "bcryptjs";
import { OrderItemType, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertUser(email: string, name: string, role: Role, plainPassword: string) {
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      passwordHash
    },
    create: {
      email,
      name,
      role,
      passwordHash
    }
  });
}

async function upsertCustomer(name: string) {
  return prisma.customer.upsert({
    where: { name },
    update: { name },
    create: { name }
  });
}

async function ensureCurrentAssignment(customerId: number, salesRepId: number, assignedById: number) {
  const current = await prisma.customerAssignment.findFirst({
    where: {
      customerId,
      endedAt: null
    },
    orderBy: {
      startedAt: "desc"
    }
  });

  if (current?.salesRepId === salesRepId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.customerAssignment.update({
        where: { id: current.id },
        data: {
          endedAt: new Date()
        }
      });
    }

    await tx.customerAssignment.create({
      data: {
        customerId,
        salesRepId,
        assignedById
      }
    });
  });
}

async function upsertCatalogCategory(name: string) {
  return prisma.catalogCategory.upsert({
    where: { name },
    update: { name },
    create: { name }
  });
}

async function upsertTopProduct(input: { name: string; sku: string | null; categoryName: string | null }) {
  const existing = await prisma.globalTopProduct.findFirst({
    where: {
      OR: [{ name: input.name }, ...(input.sku ? [{ sku: input.sku }] : [])]
    },
    select: { id: true }
  });

  if (existing) {
    return prisma.globalTopProduct.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        sku: input.sku,
        categoryName: input.categoryName,
        isActive: true
      }
    });
  }

  return prisma.globalTopProduct.create({
    data: {
      name: input.name,
      sku: input.sku,
      categoryName: input.categoryName,
      isActive: true
    }
  });
}

async function upsertOrderWithItems(input: {
  orderId: string;
  customerId: number;
  status: string;
  importedAt: string;
  items: Array<{
    lineType: OrderItemType;
    sku: string | null;
    name: string | null;
    category: string | null;
    quantity: string;
    unitPriceNetCzk: string;
    lineNetCzk: string;
  }>;
}) {
  const importedAt = new Date(input.importedAt);
  const existing = await prisma.order.findUnique({
    where: { orderId: input.orderId },
    select: { id: true }
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existing.id },
        data: {
          customerId: input.customerId,
          status: input.status,
          importedAt
        }
      });

      await tx.orderItem.deleteMany({
        where: { orderDbId: existing.id }
      });

      if (input.items.length > 0) {
        await tx.orderItem.createMany({
          data: input.items.map((item) => ({
            orderDbId: existing.id,
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
    return "updated";
  }

  await prisma.order.create({
    data: {
      orderId: input.orderId,
      customerId: input.customerId,
      status: input.status,
      importedAt,
      items: {
        create: input.items.map((item) => ({
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
  return "created";
}

async function main(): Promise<void> {
  const admin = await upsertUser("admin@crm.local", "Admin", Role.admin, "Admin123!");
  const novak = await upsertUser("novak@crm.local", "Novak", Role.sales_rep, "Sales123!");
  const svoboda = await upsertUser("svoboda@crm.local", "Svoboda", Role.sales_rep, "Sales123!");

  const ordinaceAlfa = await upsertCustomer("Ordinace Alfa");
  const ordinaceBeta = await upsertCustomer("Ordinace Beta");

  await ensureCurrentAssignment(ordinaceAlfa.id, novak.id, admin.id);
  await ensureCurrentAssignment(ordinaceBeta.id, svoboda.id, admin.id);

  const catalogCategories = [
    "Vyplnove materialy",
    "Implantologie",
    "Profylaxe",
    "Ochrana",
    "Endodoncie",
    "Chirurgie"
  ];

  for (const categoryName of catalogCategories) {
    await upsertCatalogCategory(categoryName);
  }

  const topProducts = [
    { name: "Kompozit A", sku: "TOP-001", categoryName: "Vyplnove materialy" },
    { name: "Kompozit B", sku: "TOP-002", categoryName: "Vyplnove materialy" },
    { name: "Rukavice Premium", sku: "TOP-003", categoryName: "Ochrana" },
    { name: "Maska Dental", sku: "TOP-004", categoryName: "Ochrana" },
    { name: "Vrtacek Endo X", sku: "TOP-005", categoryName: "Endodoncie" },
    { name: "Implant Set Basic", sku: "TOP-006", categoryName: "Implantologie" },
    { name: "Sonda Profi", sku: "TOP-007", categoryName: "Profylaxe" },
    { name: "Anestezie Plus", sku: "TOP-008", categoryName: "Chirurgie" },
    { name: "Cement Ultra", sku: "TOP-009", categoryName: "Vyplnove materialy" },
    { name: "Leptaci Gel", sku: "TOP-010", categoryName: "Vyplnove materialy" }
  ];

  for (const product of topProducts) {
    await upsertTopProduct(product);
  }

  const phase7SeedOrders = [
    {
      orderId: "SEED-PHASE7-ALFA-001",
      customerId: ordinaceAlfa.id,
      status: "dokoncena",
      importedAt: "2026-04-05T10:00:00Z",
      items: [
        {
          lineType: "product" as OrderItemType,
          sku: "RUK-001",
          name: "Rukavice",
          category: "Ochrana",
          quantity: "2",
          unitPriceNetCzk: "450",
          lineNetCzk: "900"
        }
      ]
    },
    {
      orderId: "SEED-PHASE7-BETA-001",
      customerId: ordinaceBeta.id,
      status: "dokoncena",
      importedAt: "2026-04-07T10:00:00Z",
      items: [
        {
          lineType: "product" as OrderItemType,
          sku: "PRO-001",
          name: "Profylaxe Set",
          category: "Profylaxe",
          quantity: "1",
          unitPriceNetCzk: "1200",
          lineNetCzk: "1200"
        }
      ]
    }
  ];

  let createdOrders = 0;
  let updatedOrders = 0;
  for (const order of phase7SeedOrders) {
    const result = await upsertOrderWithItems(order);
    if (result === "created") {
      createdOrders += 1;
    } else {
      updatedOrders += 1;
    }
  }

  console.log("Seed complete:");
  console.log("- admin@crm.local / Admin123!");
  console.log("- novak@crm.local / Sales123!");
  console.log("- svoboda@crm.local / Sales123!");
  console.log("- Customers: Ordinace Alfa -> Novak, Ordinace Beta -> Svoboda");
  console.log(`- Catalog categories: ${catalogCategories.length}`);
  console.log(`- Global top products: ${topProducts.length}`);
  console.log(`- Phase 7 seed orders: created ${createdOrders}, updated ${updatedOrders}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
