import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../types/auth";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
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
