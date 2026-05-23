import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser;

    if (!user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ message: "Insufficient permissions." });
      return;
    }

    next();
  };
}
