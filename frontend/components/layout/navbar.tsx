"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Menu, TrendingUp, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

const navLinks = [
  { label: "Markets", href: "/markets", icon: TrendingUp },
  { label: "Portfolio", href: "/portfolio", icon: TrendingUp },
  { label: "Liquidity", href: "/liquidity", icon: Droplets },
  { label: "Governance", href: "/governance", icon: TrendingUp },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg group">
          <div className="rounded-md bg-stellar p-1 group-hover:bg-stellar-dark transition-colors">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span>Polaris</span>
          <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 border-stellar/30 text-stellar-light hidden sm:inline-flex">
            TESTNET
          </Badge>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  active
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Wallet + Mobile Menu */}
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-1.5 mr-2">
            <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>

          <WalletButton />

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-background/95 backdrop-blur-md border-border/50">
              <div className="flex items-center gap-2 mb-8 mt-2">
                <div className="rounded-md bg-stellar p-1">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold">Polaris</span>
              </div>
              <nav className="flex flex-col gap-1">
                {navLinks.map((link) => {
                  const active = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                        active
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
