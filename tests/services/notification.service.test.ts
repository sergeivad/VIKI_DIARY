import { describe, expect, it, vi } from "vitest";

import { NotificationService } from "../../src/services/notification.service.js";

describe("NotificationService", () => {
  it("notifies all members except excluded user", async () => {
    const babyService = {
      getMembers: vi.fn().mockResolvedValue([
        { id: "user-1", telegramId: BigInt(1001) },
        { id: "user-2", telegramId: BigInt(1002) },
        { id: "user-3", telegramId: BigInt(1003) }
      ])
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    const service = new NotificationService(babyService as never, sendMessage);

    await service.notifyOtherMembers({
      babyId: "baby-1",
      excludeUserId: "user-2",
      text: "new entry"
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, BigInt(1001), "new entry");
    expect(sendMessage).toHaveBeenNthCalledWith(2, BigInt(1003), "new entry");
  });

  it("continues delivery when one recipient send fails", async () => {
    const babyService = {
      getMembers: vi.fn().mockResolvedValue([
        { id: "user-1", telegramId: BigInt(1001) },
        { id: "user-2", telegramId: BigInt(1002) }
      ])
    };
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("chat blocked"))
      .mockResolvedValueOnce(undefined);

    const service = new NotificationService(babyService as never, sendMessage);

    await service.notifyOtherMembers({
      babyId: "baby-1",
      excludeUserId: "user-9",
      text: "new entry"
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, BigInt(1001), "new entry");
    expect(sendMessage).toHaveBeenNthCalledWith(2, BigInt(1002), "new entry");
  });
});
