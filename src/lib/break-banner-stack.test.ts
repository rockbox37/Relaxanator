import { describe, expect, it } from "vitest";

import {
  type ActiveBreak,
  pushActiveBreak,
  removeActiveBreak,
} from "./break-banner-stack";

describe("pushActiveBreak", () => {
  it("appends a new kind without dropping existing banners", () => {
    const stretch: ActiveBreak = { kind: "stretch", message: "Stretch" };
    const walk: ActiveBreak = { kind: "walk", message: "Walk" };
    const stacked = pushActiveBreak([stretch], walk);
    expect(stacked).toEqual([stretch, walk]);
  });

  it("refreshes message in place when the same kind fires again", () => {
    const stretch: ActiveBreak = { kind: "stretch", message: "Stretch" };
    const walk: ActiveBreak = { kind: "walk", message: "Walk" };
    const refreshed = pushActiveBreak([stretch, walk], {
      kind: "stretch",
      message: "Time to stretch again",
    });
    expect(refreshed).toEqual([
      { kind: "stretch", message: "Time to stretch again" },
      walk,
    ]);
  });

  it("starts a stack from empty", () => {
    expect(pushActiveBreak([], { kind: "water", message: "Drink" })).toEqual([
      { kind: "water", message: "Drink" },
    ]);
  });
});

describe("removeActiveBreak", () => {
  it("removes only the targeted kind", () => {
    const stack: ActiveBreak[] = [
      { kind: "stretch", message: "Stretch" },
      { kind: "walk", message: "Walk" },
      { kind: "water", message: "Water" },
    ];
    expect(removeActiveBreak(stack, "walk")).toEqual([
      { kind: "stretch", message: "Stretch" },
      { kind: "water", message: "Water" },
    ]);
  });

  it("is a no-op when the kind is not stacked", () => {
    const stack: ActiveBreak[] = [{ kind: "stretch", message: "Stretch" }];
    expect(removeActiveBreak(stack, "custom")).toEqual(stack);
  });
});
