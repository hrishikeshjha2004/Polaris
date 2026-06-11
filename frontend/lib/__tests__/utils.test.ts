import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn() className merger", () => {
  it("joins multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("respects conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("deduplicates conflicting tailwind utilities (last wins)", () => {
    // tailwind-merge should keep only the last padding utility
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("merges conflicting color utilities correctly", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});
