import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentNotificationPermission,
  notificationSupport,
  requestNotificationPermission,
  showBreakNotification,
} from "./break-notifications";

const originalNotification = globalThis.Notification;

afterEach(() => {
  if (originalNotification === undefined) {
    // @ts-expect-error restore missing Notification
    delete globalThis.Notification;
  } else {
    globalThis.Notification = originalNotification;
  }
  vi.restoreAllMocks();
});

describe("notificationSupport / currentNotificationPermission", () => {
  it("reports unsupported when Notification is missing", () => {
    // @ts-expect-error test unsupported path
    delete globalThis.Notification;
    expect(notificationSupport()).toBe(false);
    expect(currentNotificationPermission()).toBe("unsupported");
  });

  it("reads Notification.permission when available", () => {
    class FakeNotification {
      static permission = "denied" as NotificationPermission;
      static requestPermission = vi.fn();
      constructor(_title: string, _opts?: NotificationOptions) {}
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    expect(notificationSupport()).toBe(true);
    expect(currentNotificationPermission()).toBe("denied");
  });
});

describe("requestNotificationPermission", () => {
  it("returns unsupported without Notification", async () => {
    // @ts-expect-error test unsupported path
    delete globalThis.Notification;
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
  });

  it("returns the permission result", async () => {
    class FakeNotification {
      static permission = "default" as NotificationPermission;
      static requestPermission = vi.fn().mockResolvedValue("granted");
      constructor(_title: string, _opts?: NotificationOptions) {}
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    await expect(requestNotificationPermission()).resolves.toBe("granted");
  });

  it("treats request failures as denied", async () => {
    class FakeNotification {
      static permission = "default" as NotificationPermission;
      static requestPermission = vi.fn().mockRejectedValue(new Error("blocked"));
      constructor(_title: string, _opts?: NotificationOptions) {}
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });
});

describe("showBreakNotification", () => {
  it("returns null when unsupported or not granted", () => {
    // @ts-expect-error test unsupported path
    delete globalThis.Notification;
    expect(showBreakNotification({ body: "Stretch" })).toBeNull();
  });

  it("constructs a Notification when permission is granted", () => {
    const ctor = vi.fn();
    class FakeNotification {
      static permission = "granted" as NotificationPermission;
      static requestPermission = vi.fn();
      constructor(title: string, opts?: NotificationOptions) {
        ctor(title, opts);
      }
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    const n = showBreakNotification({ body: "Time to stretch", tag: "t1" });
    expect(n).toBeInstanceOf(FakeNotification);
    expect(ctor).toHaveBeenCalledWith("Relaxanator", {
      body: "Time to stretch",
      tag: "t1",
      silent: false,
    });
  });

  it("returns null when the constructor throws", () => {
    class FakeNotification {
      static permission = "granted" as NotificationPermission;
      static requestPermission = vi.fn();
      constructor(_title: string, _opts?: NotificationOptions) {
        throw new Error("blocked");
      }
    }
    globalThis.Notification =
      FakeNotification as unknown as typeof Notification;
    expect(showBreakNotification({ body: "Walk" })).toBeNull();
  });
});
