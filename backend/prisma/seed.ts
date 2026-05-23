import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

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

async function main(): Promise<void> {
  const admin = await upsertUser("admin@crm.local", "Admin", Role.admin, "Admin123!");
  const novak = await upsertUser("novak@crm.local", "Novak", Role.sales_rep, "Sales123!");
  const svoboda = await upsertUser("svoboda@crm.local", "Svoboda", Role.sales_rep, "Sales123!");

  const ordinaceAlfa = await upsertCustomer("Ordinace Alfa");
  const ordinaceBeta = await upsertCustomer("Ordinace Beta");

  await ensureCurrentAssignment(ordinaceAlfa.id, novak.id, admin.id);
  await ensureCurrentAssignment(ordinaceBeta.id, svoboda.id, admin.id);

  console.log("Seed complete:");
  console.log("- admin@crm.local / Admin123!");
  console.log("- novak@crm.local / Sales123!");
  console.log("- svoboda@crm.local / Sales123!");
  console.log("- Customers: Ordinace Alfa -> Novak, Ordinace Beta -> Svoboda");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
