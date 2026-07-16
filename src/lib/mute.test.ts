import { describe, expect, it } from "vitest";

import {
  type MuteState,
  isExceptTodoActive,
  isMuteAllActive,
  muteGains,
  toggleMuteAll,
  toggleMuteExceptTodo,
} from "./mute";

describe("muteGains", () => {
  it("off leaves both gates open", () => {
    expect(muteGains("off")).toEqual({ output: 1, mainGroup: 1 });
  });

  it("all closes the output gate (silences everything, ToDo cues included)", () => {
    expect(muteGains("all")).toEqual({ output: 0, mainGroup: 1 });
  });

  it("except-todo closes only the main group (ToDo cues stay audible)", () => {
    expect(muteGains("except-todo")).toEqual({ output: 1, mainGroup: 0 });
  });
});

describe("toggleMuteAll", () => {
  it("toggles between off and all", () => {
    expect(toggleMuteAll("off")).toBe("all");
    expect(toggleMuteAll("all")).toBe("off");
  });

  it("switches into all from except-todo", () => {
    expect(toggleMuteAll("except-todo")).toBe("all");
  });
});

describe("toggleMuteExceptTodo", () => {
  it("toggles between off and except-todo", () => {
    expect(toggleMuteExceptTodo("off")).toBe("except-todo");
    expect(toggleMuteExceptTodo("except-todo")).toBe("off");
  });

  it("switches into except-todo from all", () => {
    expect(toggleMuteExceptTodo("all")).toBe("except-todo");
  });
});

describe("active-state helpers", () => {
  it("report the current latched button", () => {
    const cases: Array<[MuteState, boolean, boolean]> = [
      ["off", false, false],
      ["all", true, false],
      ["except-todo", false, true],
    ];
    for (const [state, all, exceptTodo] of cases) {
      expect(isMuteAllActive(state)).toBe(all);
      expect(isExceptTodoActive(state)).toBe(exceptTodo);
    }
  });
});
