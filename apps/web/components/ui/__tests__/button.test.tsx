import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("<Button />", () => {
  it("renders a native button with its label", () => {
    render(<Button>Buy YES</Button>);
    expect(screen.getByRole("button", { name: "Buy YES" })).toBeInTheDocument();
  });

  it("fires onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Trade</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/markets">Markets</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Markets" });
    expect(link).toBeInTheDocument();
    expect(link.className).toContain("inline-flex");
  });
});
