/**
 * In-app break banner stack (#61).
 * One entry per break kind; new kinds append, same-kind fires refresh
 * the message in place so overlapping schedules never clobber others.
 */

import type { BreakKind } from "./breaks";

export interface ActiveBreak {
  kind: BreakKind;
  message: string;
}

/** Append a new kind, or refresh message when that kind is already stacked. */
export function pushActiveBreak(
  stack: readonly ActiveBreak[],
  next: ActiveBreak,
): ActiveBreak[] {
  const idx = stack.findIndex((b) => b.kind === next.kind);
  if (idx >= 0) {
    const copy = stack.slice();
    copy[idx] = next;
    return copy;
  }
  return [...stack, next];
}

/** Remove a single kind from the stack (dismiss / snooze / I did.). */
export function removeActiveBreak(
  stack: readonly ActiveBreak[],
  kind: BreakKind,
): ActiveBreak[] {
  return stack.filter((b) => b.kind !== kind);
}
