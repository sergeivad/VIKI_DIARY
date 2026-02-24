import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaClient } from "./client.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
