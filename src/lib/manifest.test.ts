import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("meets installability basics (name, standalone, 192+512 icons)", () => {
    const m = manifest();
    expect(m.name).toBe("Relaxanator");
    expect(m.short_name).toBe("Relaxanator");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#000000");
    expect(m.background_color).toBe("#000000");

    const icons = m.icons ?? [];
    const sizes = new Set(icons.map((i) => i.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);
    expect(icons.every((i) => typeof i.src === "string" && i.src.startsWith("/icons/"))).toBe(
      true,
    );
  });
});
