import type { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

export type ResetDiaryResult = {
  telegramId: bigint;
  babyId: string;
  babyName: string;
  memberCount: number;
  entryCount: number;
  summaryCount: number;
};

export function parseTelegramIdArgument(value: string | undefined): bigint {
  if (!value) {
    throw new Error("Telegram ID argument is required");
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("Telegram ID must contain only digits");
  }

  return BigInt(value);
}

export async function resetDiaryByTelegramId(db: PrismaClient, telegramId: bigint): Promise<ResetDiaryResult> {
  const membership = await db.babyMember.findFirst({
    where: {
      user: {
        telegramId,
      },
    },
    select: {
      baby: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              members: true,
              diaryEntries: true,
              summaries: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error(`Diary not found for Telegram user ${telegramId.toString()}`);
  }

  await db.$transaction(async (tx) => {
    await tx.baby.delete({
      where: {
        id: membership.baby.id,
      },
    });
  });

  return {
    telegramId,
    babyId: membership.baby.id,
    babyName: membership.baby.name,
    memberCount: membership.baby._count.members,
    entryCount: membership.baby._count.diaryEntries,
    summaryCount: membership.baby._count.summaries,
  };
}

async function main(): Promise<void> {
  const telegramId = parseTelegramIdArgument(process.argv[2]);
  const { prisma } = await import("../db/prisma.js");

  try {
    const result = await resetDiaryByTelegramId(prisma, telegramId);
    console.log(
      [
        `Deleted diary "${result.babyName}" (${result.babyId})`,
        `for Telegram user ${result.telegramId.toString()}.`,
        `Members: ${result.memberCount}, entries: ${result.entryCount}, summaries: ${result.summaryCount}.`,
      ].join(" "),
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
