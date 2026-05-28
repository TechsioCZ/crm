import { Router } from "express";
import type { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../types/auth";
import {
  assertDevModeEnabled,
  deleteDevUserByEmail,
  readDevUsersFile,
  upsertDevUser,
  type DevUser
} from "../lib/dev-users";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const devUserPayloadSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "sales_rep"]),
  password: z.string().min(6).max(120)
});

const devUserEmailParamSchema = z.object({
  email: z.string().trim().min(1)
});

function issueTokens(user: AuthUser): { accessToken: string; refreshToken: string } {
  const accessExpiresIn = env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"];
  const refreshExpiresIn = env.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"];

  const accessToken = jwt.sign({ ...user, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: accessExpiresIn
  });

  const refreshToken = jwt.sign({ ...user, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: refreshExpiresIn
  });

  return { accessToken, refreshToken };
}

function failIfNotDevMode(res: Response): boolean {
  if (assertDevModeEnabled()) {
    return false;
  }

  res.status(403).json({ message: "Dev users manager is disabled in production." });
  return true;
}

async function syncDevUserToDatabase(devUser: DevUser): Promise<void> {
  const passwordHash = await bcrypt.hash(devUser.password, 10);

  await prisma.user.upsert({
    where: { email: devUser.email },
    update: {
      name: devUser.name,
      role: devUser.role,
      passwordHash,
      isActive: true
    },
    create: {
      email: devUser.email,
      name: devUser.name,
      role: devUser.role,
      passwordHash,
      isActive: true
    }
  });
}

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid login payload." });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    res.status(401).json({ message: "Invalid credentials." });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ message: "User account is inactive." });
    return;
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    res.status(401).json({ message: "Invalid credentials." });
    return;
  }

  const authUser: AuthUser = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const tokens = issueTokens(authUser);

  res.json({
    user: authUser,
    ...tokens
  });
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid refresh payload." });
    return;
  }

  try {
    const payload = jwt.verify(parsed.data.refreshToken, env.JWT_REFRESH_SECRET) as AuthUser & {
      type: "refresh";
    };

    if (payload.type !== "refresh") {
      res.status(401).json({ message: "Invalid refresh token type." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({ message: "User no longer exists." });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ message: "User account is inactive." });
      return;
    }

    const authUser: AuthUser = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const tokens = issueTokens(authUser);

    res.json({
      user: authUser,
      ...tokens
    });
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.authUser });
});

authRouter.post("/logout", (_req, res) => {
  res.status(204).send();
});

authRouter.get("/dev-users", async (_req, res) => {
  if (failIfNotDevMode(res)) {
    return;
  }

  const users = await readDevUsersFile();
  for (const user of users) {
    await syncDevUserToDatabase(user);
  }

  res.json({
    users,
    message: "Development only: this endpoint exposes plain-text passwords."
  });
});

authRouter.post("/dev-users", async (req, res) => {
  if (failIfNotDevMode(res)) {
    return;
  }

  const parsed = devUserPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid dev user payload." });
    return;
  }

  const normalizedUser: DevUser = {
    email: parsed.data.email.trim().toLowerCase(),
    name: parsed.data.name.trim(),
    role: parsed.data.role,
    password: parsed.data.password
  };

  const previousUsers = await readDevUsersFile();
  const existed = previousUsers.some((user) => user.email === normalizedUser.email);
  const users = await upsertDevUser(normalizedUser);
  await syncDevUserToDatabase(normalizedUser);

  res.status(existed ? 200 : 201).json({
    users,
    message: existed ? "Dev user updated." : "Dev user created."
  });
});

authRouter.delete("/dev-users/:email", async (req, res) => {
  if (failIfNotDevMode(res)) {
    return;
  }

  const parsed = devUserEmailParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid email parameter." });
    return;
  }

  const targetEmail = decodeURIComponent(parsed.data.email).trim().toLowerCase();
  const { users, removed } = await deleteDevUserByEmail(targetEmail);
  if (!removed) {
    res.status(404).json({ message: "Dev user not found." });
    return;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { id: true }
  });

  if (dbUser) {
    const disabledPasswordHash = await bcrypt.hash(`disabled-${targetEmail}-${Date.now()}`, 10);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash: disabledPasswordHash
      }
    });
  }

  res.json({
    users,
    message: "Dev user removed. Database password was disabled for this account."
  });
});

