import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env";

const devUserSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "sales_rep"]),
  password: z.string().min(6).max(120)
});

const devUsersFileSchema = z.object({
  users: z.array(devUserSchema)
});

export type DevUser = z.infer<typeof devUserSchema>;

export const DEV_USERS_FILE_NAME = "dev-users-DELETE_BEFORE_LOUNCH.json";
const DEV_USERS_FILE_PATH = path.resolve(process.cwd(), DEV_USERS_FILE_NAME);

const defaultDevUsers: DevUser[] = [
  { email: "admin@crm.local", name: "Admin", role: "admin", password: "Admin123!" },
  { email: "sales01@crm.local", name: "Obchodnik 01", role: "sales_rep", password: "Sales123!" },
  { email: "sales02@crm.local", name: "Obchodnik 02", role: "sales_rep", password: "Sales123!" },
  { email: "sales03@crm.local", name: "Obchodnik 03", role: "sales_rep", password: "Sales123!" },
  { email: "sales04@crm.local", name: "Obchodnik 04", role: "sales_rep", password: "Sales123!" },
  { email: "sales05@crm.local", name: "Obchodnik 05", role: "sales_rep", password: "Sales123!" }
];

function normalizeAndSortUsers(users: DevUser[]): DevUser[] {
  const dedupe = new Map<string, DevUser>();
  for (const user of users) {
    dedupe.set(user.email.trim().toLowerCase(), {
      email: user.email.trim().toLowerCase(),
      name: user.name.trim(),
      role: user.role,
      password: user.password
    });
  }

  return [...dedupe.values()].sort((left, right) => left.email.localeCompare(right.email));
}

async function ensureDevUsersFile(): Promise<void> {
  try {
    await fs.access(DEV_USERS_FILE_PATH);
  } catch {
    const initial = {
      users: defaultDevUsers
    };
    await fs.writeFile(DEV_USERS_FILE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

export async function readDevUsersFile(): Promise<DevUser[]> {
  await ensureDevUsersFile();
  const raw = await fs.readFile(DEV_USERS_FILE_PATH, "utf8");
  const parsed = devUsersFileSchema.parse(JSON.parse(raw));
  return normalizeAndSortUsers(parsed.users);
}

export async function writeDevUsersFile(users: DevUser[]): Promise<DevUser[]> {
  const normalized = normalizeAndSortUsers(users);
  const payload = {
    users: normalized
  };
  await fs.writeFile(DEV_USERS_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return normalized;
}

export async function upsertDevUser(user: DevUser): Promise<DevUser[]> {
  const allUsers = await readDevUsersFile();
  const filtered = allUsers.filter((existing) => existing.email !== user.email);
  filtered.push({
    email: user.email,
    name: user.name,
    role: user.role,
    password: user.password
  });
  return writeDevUsersFile(filtered);
}

export async function deleteDevUserByEmail(email: string): Promise<{ users: DevUser[]; removed: boolean }> {
  const target = email.trim().toLowerCase();
  const allUsers = await readDevUsersFile();
  const nextUsers = allUsers.filter((user) => user.email !== target);
  const removed = nextUsers.length !== allUsers.length;
  const users = await writeDevUsersFile(nextUsers);
  return { users, removed };
}

export function assertDevModeEnabled(): boolean {
  return env.NODE_ENV !== "production";
}

export function logDevUsersFileReminder(): void {
  if (!existsSync(DEV_USERS_FILE_PATH)) {
    return;
  }

  console.warn(
    `[SECURITY REMINDER] This project uses ${DEV_USERS_FILE_NAME}. Delete this file before production launch.`
  );
}
