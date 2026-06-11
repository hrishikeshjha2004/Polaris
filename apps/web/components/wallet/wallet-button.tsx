"use client";

import { useState } from "react";
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/components/ui/use-toast";
import { truncateAddress } from "@stellarpm/shared";

export function WalletButton() {
  const { isConnected, address, isConnecting, connectFreighter, disconnect } =
    useWallet();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  if (!isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-stellar/30 hover:border-stellar/60 hover:bg-stellar/10"
        onClick={connectFreighter}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-stellar border-t-transparent animate-spin" />
            Connecting...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </span>
        )}
      </Button>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(address!);
    toast({ description: "Address copied to clipboard" });
    setIsOpen(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-stellar/30 hover:border-stellar/60 bg-stellar/5"
        >
          <span className="h-2 w-2 rounded-full bg-yes mr-2" />
          {truncateAddress(address!)}
          <ChevronDown className="ml-2 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`https://stellar.expert/explorer/testnet/account/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center"
            onClick={() => setIsOpen(false)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View on Explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            disconnect();
            setIsOpen(false);
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
