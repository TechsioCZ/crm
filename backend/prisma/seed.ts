import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role, TaskPriority } from "@prisma/client";

const prisma = new PrismaClient();

const SALES_REP_COUNT = 5;
const CUSTOMER_COUNT = 50;
const PRODUCT_COUNT = 50;
const ORDERS_PER_CUSTOMER = 10;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne<T>(rng: () => number, list: T[]): T {
  return list[randomInt(rng, 0, list.length - 1)];
}

function randomDateBetween(rng: () => number, from: Date, to: Date): Date {
  const fromTs = from.getTime();
  const toTs = to.getTime();
  const ts = Math.floor(rng() * (toTs - fromTs + 1)) + fromTs;
  return new Date(ts);
}

function pad(value: number, digits: number): string {
  return value.toString().padStart(digits, "0");
}

function money(value: number): string {
  return value.toFixed(2);
}

async function cleanDatabase(): Promise<void> {
  await prisma.importRunError.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.customerTask.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.recommendationRule.deleteMany();
  await prisma.customerGroup.deleteMany();
  await prisma.customerAssignment.deleteMany();
  await prisma.globalTopProduct.deleteMany();
  await prisma.catalogCategory.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  const rng = createRng(20260525);

  await cleanDatabase();

  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  const salesPasswordHash = await bcrypt.hash("Sales123!", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@crm.local",
      name: "Admin",
      role: Role.admin,
      passwordHash: adminPasswordHash
    }
  });

  const salesReps = [];
  for (let index = 1; index <= SALES_REP_COUNT; index += 1) {
    const rep = await prisma.user.create({
      data: {
        email: `sales${pad(index, 2)}@crm.local`,
        name: `Obchodnik ${pad(index, 2)}`,
        role: Role.sales_rep,
        passwordHash: salesPasswordHash
      }
    });
    salesReps.push(rep);
  }

  const categoryNames = [
    "Vyplnove materialy",
    "Implantologie",
    "Profylaxe",
    "Ochrana",
    "Endodoncie",
    "Chirurgie",
    "Anestezie",
    "Nastroje",
    "Hygiena",
    "Spotrebni material"
  ];

  await prisma.catalogCategory.createMany({
    data: categoryNames.map((name) => ({ name }))
  });

  const products: Array<{
    sku: string;
    name: string;
    categoryName: string;
    basePriceNetCzk: number;
  }> = [];

  for (let index = 1; index <= PRODUCT_COUNT; index += 1) {
    products.push({
      sku: `PRD-${pad(index, 3)}`,
      name: `Produkt ${pad(index, 3)}`,
      categoryName: categoryNames[(index - 1) % categoryNames.length],
      basePriceNetCzk: randomInt(rng, 80, 5200)
    });
  }

  await prisma.globalTopProduct.createMany({
    data: products.map((product) => ({
      sku: product.sku,
      name: product.name,
      categoryName: product.categoryName,
      isActive: true
    }))
  });

  await prisma.customer.createMany({
    data: Array.from({ length: CUSTOMER_COUNT }, (_, index) => ({
      name: `Klient ${pad(index + 1, 3)}`
    }))
  });

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" }
  });

  const assignmentMap = new Map<number, number>();
  const assignmentRows = customers.map((customer) => {
    const rep = pickOne(rng, salesReps);
    assignmentMap.set(customer.id, rep.id);
    return {
      customerId: customer.id,
      salesRepId: rep.id,
      assignedById: admin.id,
      startedAt: randomDateBetween(rng, new Date("2025-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"))
    };
  });

  await prisma.customerAssignment.createMany({
    data: assignmentRows
  });

  const statuses = ["nova", "ceka na dodavatele", "v preprave", "dokoncena"];
  const orderFrom = new Date("2025-01-01T00:00:00Z");
  const orderTo = new Date("2026-05-20T23:59:59Z");
  const taskFrom = new Date("2026-06-01T00:00:00Z");
  const taskTo = new Date("2026-12-31T23:59:59Z");

  let createdOrders = 0;
  let createdOrderItems = 0;
  let createdNotes = 0;
  let createdTasks = 0;

  for (const customer of customers) {
    const ownerUserId = assignmentMap.get(customer.id);
    if (!ownerUserId) {
      continue;
    }

    await prisma.customerNote.create({
      data: {
        customerId: customer.id,
        authorUserId: ownerUserId,
        text: `Kontaktovat ${customer.name} ohledne nove nabidky.`
      }
    });
    createdNotes += 1;

    await prisma.customerTask.create({
      data: {
        customerId: customer.id,
        ownerUserId,
        description: `Follow-up s ${customer.name}`,
        dueDate: randomDateBetween(rng, taskFrom, taskTo),
        priority: pickOne(rng, [TaskPriority.low, TaskPriority.medium, TaskPriority.high])
      }
    });
    createdTasks += 1;

    for (let orderIndex = 1; orderIndex <= ORDERS_PER_CUSTOMER; orderIndex += 1) {
      const order = await prisma.order.create({
        data: {
          orderId: `SYN-${pad(customer.id, 3)}-${pad(orderIndex, 2)}`,
          customerId: customer.id,
          status: pickOne(rng, statuses),
          importedAt: randomDateBetween(rng, orderFrom, orderTo)
        }
      });
      createdOrders += 1;

      const itemRows: Array<{
        orderDbId: number;
        lineType: "product" | "shipping" | "payment";
        sku: string | null;
        name: string | null;
        category: string | null;
        quantity: string;
        unitPriceNetCzk: string;
        lineNetCzk: string;
      }> = [];

      const productLines = randomInt(rng, 2, 6);
      for (let itemIndex = 0; itemIndex < productLines; itemIndex += 1) {
        const product = pickOne(rng, products);
        const quantity = randomInt(rng, 1, 8);
        const priceFactor = 0.8 + rng() * 0.6;
        const unitPrice = Math.max(10, Math.round(product.basePriceNetCzk * priceFactor * 100) / 100);
        const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

        itemRows.push({
          orderDbId: order.id,
          lineType: "product",
          sku: product.sku,
          name: product.name,
          category: product.categoryName,
          quantity: quantity.toString(),
          unitPriceNetCzk: money(unitPrice),
          lineNetCzk: money(lineTotal)
        });
      }

      if (rng() < 0.75) {
        const shipping = randomInt(rng, 90, 260);
        itemRows.push({
          orderDbId: order.id,
          lineType: "shipping",
          sku: null,
          name: "Doprava",
          category: null,
          quantity: "1",
          unitPriceNetCzk: money(shipping),
          lineNetCzk: money(shipping)
        });
      }

      if (rng() < 0.55) {
        const payment = randomInt(rng, 20, 90);
        itemRows.push({
          orderDbId: order.id,
          lineType: "payment",
          sku: null,
          name: "Platba",
          category: null,
          quantity: "1",
          unitPriceNetCzk: money(payment),
          lineNetCzk: money(payment)
        });
      }

      await prisma.orderItem.createMany({
        data: itemRows
      });
      createdOrderItems += itemRows.length;
    }
  }

  console.log("Synthetic seed complete:");
  console.log("- Admin login: admin@crm.local / Admin123!");
  console.log("- Sales login pattern: sales01..sales05@crm.local / Sales123!");
  console.log(`- Sales reps: ${salesReps.length}`);
  console.log(`- Customers: ${customers.length}`);
  console.log(`- Products: ${products.length}`);
  console.log(`- Orders: ${createdOrders} (${ORDERS_PER_CUSTOMER} per customer)`);
  console.log(`- Order items: ${createdOrderItems}`);
  console.log(`- CRM notes: ${createdNotes}`);
  console.log(`- CRM tasks: ${createdTasks}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
