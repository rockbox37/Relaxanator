/**
 * Optional Notification API helpers for break prompts (FR-3).
 * Permission deny / unsupported browsers degrade gracefully — callers
 * treat a null return as "no notification shown".
 */

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export function notificationSupport(): boolean {
  return typeof Notification !== "undefined";
}

export function currentNotificationPermission(): NotificationPermissionState {
  if (!notificationSupport()) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

/**
 * Request notification permission from a user gesture. Returns the
 * resulting state; never throws on deny or unsupported.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationSupport()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return "denied";
  }
}

export interface BreakNotificationOptions {
  title?: string;
  body: string;
  tag?: string;
}

/**
 * Show a break notification when permission is granted. Returns the
 * Notification instance, or null when unsupported / denied / blocked.
 */
export function showBreakNotification(
  options: BreakNotificationOptions,
): Notification | null {
  if (!notificationSupport()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    return new Notification(options.title ?? "Relaxanator", {
      body: options.body,
      tag: options.tag ?? "relaxanator-break",
      silent: false,
    });
  } catch {
    return null;
  }
}
