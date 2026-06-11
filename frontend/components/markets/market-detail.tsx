"use client";

import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Market } from "@stellarpm/shared";
import { truncateAddress } from "@stellarpm/shared";

interface MarketDetailProps {
  market: Market;
}

export function MarketDetail({ market }: MarketDetailProps) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Resolution Criteria</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {market.description}
          </p>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <DetailRow
            label="Oracle Source"
            value={market.oracleSource.replace(/_/g, " ")}
          />
          <DetailRow
            label="Threshold"
            value={`$${(market.thresholdValue / 1e7).toLocaleString()}`}
          />
          <DetailRow
            label="Expires"
            value={format(new Date(market.expiryTimestamp * 1000), "PPP 'at' HH:mm 'UTC'")}
          />
          <DetailRow label="Category" value={market.category.replace(/_/g, " ")} />
          <DetailRow
            label="Creator"
            value={
              <a
                href={`https://stellar.expert/explorer/testnet/account/${market.creator}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-stellar-light hover:underline"
              >
                {truncateAddress(market.creator)}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
          <DetailRow
            label="Market Contract"
            value={
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${market.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-stellar-light hover:underline"
              >
                {truncateAddress(market.contractAddress)}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-muted-foreground block mb-0.5">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
