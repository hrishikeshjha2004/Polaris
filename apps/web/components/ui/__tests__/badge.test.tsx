import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("<Badge />", () => {
  it("renders its children", () => {
    render(<Badge>Live</Badge>);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("applies the default variant classes", () => {
    render(<Badge>Default</Badge>);
    const el = screen.getByText("Default");
    expect(el.className).toContain("bg-primary");
  });

  it("applies the destructive variant classes", () => {
    render(<Badge variant="destructive">Resolved</Badge>);
    const el = screen.getByText("Resolved");
    expect(el.className).toContain("bg-destructive");
  });

  it("merges a custom className", () => {
    render(<Badge className="custom-xyz">Tag</Badge>);
    expect(screen.getByText("Tag").className).toContain("custom-xyz");
  });
});
