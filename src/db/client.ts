// CJS → ESM bridge for @prisma/client
// Node.js 22 ESM cannot do named value imports from CJS modules.
// This file re-exports runtime values via default import.
// Type-only imports from "@prisma/client" are fine (erased at compile time).

import pkg from "@prisma/client";

export const PrismaClient = pkg.PrismaClient;
export const EntryItemType = pkg.EntryItemType;
export const BabyMemberRole = pkg.BabyMemberRole;
export const Prisma = pkg.Prisma;
