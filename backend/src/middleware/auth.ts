import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types/auth";
import { prisma } from "../lib/prisma";

type AccessPayload = AuthUser & { type: "access" };

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token." });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type !== "access") {
      res.status(401).json({ message: "Invalid access token type." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "User account is inactive or missing." });
      return;
    }

    req.authUser = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}
