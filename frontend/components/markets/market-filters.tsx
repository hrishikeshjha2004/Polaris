"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MarketStatus } from "@stellarpm/shared";

interface MarketFiltersProps {
  status: MarketStatus | "all";
  onStatusChange: (v: MarketStatus | "all") => void;
  category: string;
  onCategoryChange: (v: string) => void;
  sortBy: "volume" | "newest" | "expiry";
  onSortByChange: (v: "volume" | "newest" | "expiry") => void;
}

export function MarketFilters({
  status,
  onStatusChange,
  category,
  onCategoryChange,
  sortBy,
  onSortByChange,
}: MarketFiltersProps) {
  const hasActiveFilter = status !== "all" || category !== "all" || sortBy !== "volume";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={hasActiveFilter ? "border-stellar/50 bg-stellar/10" : ""}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filter
          {hasActiveFilter && (
            <span className="ml-2 rounded-full bg-stellar text-white text-xs w-4 h-4 flex items-center justify-center">
              !
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Sort By</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortBy}
          onValueChange={(v) => onSortByChange(v as typeof sortBy)}
        >
          <DropdownMenuRadioItem value="volume">Volume</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="newest">Newest</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="expiry">Expiry</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(v) => onStatusChange(v as typeof status)}
        >
          <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="open">Open</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="expired">Expired</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="resolved">Resolved</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Category</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={category} onValueChange={onCategoryChange}>
          <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="crypto_price">Crypto Price</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
