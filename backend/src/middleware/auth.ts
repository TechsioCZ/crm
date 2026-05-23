import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types/auth";

type AccessPayload = AuthUser & { type: "access" };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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

    req.authUser = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}
