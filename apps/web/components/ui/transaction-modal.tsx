"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TxStatus = "idle" | "pending" | "confirming" | "success" | "error";

interface TransactionModalProps {
  open: boolean;
  status: TxStatus;
  txHash?: string;
  errorMsg?: string;
  outcome?: "yes" | "no";
  amount?: string;
  tokensOut?: number;
  onClose: () => void;
}

export function TransactionModal({
  open,
  status,
  txHash,
  errorMsg,
  outcome,
  amount,
  tokensOut,
  onClose,
}: TransactionModalProps) {
  const explorerUrl = txHash
    ? `https://stellar.expert/explorer/testnet/tx/${txHash}`
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={status === "success" || status === "error" ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm"
          >
            <div className="glass rounded-2xl border border-border/50 p-6 shadow-2xl">
              {/* Close button (only when done) */}
              {(status === "success" || status === "error") && (
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Icon */}
              <div className="flex flex-col items-center text-center mb-6">
                {status === "pending" || status === "confirming" ? (
                  <div className="relative mb-4">
                    <div
                      className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center",
                        outcome === "yes" ? "bg-yes/10" : "bg-no/10"
                      )}
                    >
                      <Loader2
                        className={cn(
                          "h-8 w-8 animate-spin",
                          outcome === "yes" ? "text-yes" : "text-no"
                        )}
                      />
                    </div>
                  </div>
                ) : status === "success" ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.4, delay: 0.1 }}
                    className="mb-4"
                  >
                    <CheckCircle2 className="h-16 w-16 text-yes" />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.4, delay: 0.1 }}
                    className="mb-4"
                  >
                    <XCircle className="h-16 w-16 text-destructive" />
                  </motion.div>
                )}

                <h3 className="text-lg font-semibold">
                  {status === "pending"
                    ? "Awaiting Wallet Approval"
                    : status === "confirming"
                    ? "Transaction Confirming"
                    : status === "success"
                    ? "Trade Executed!"
                    : "Transaction Failed"}
                </h3>

                <p className="text-sm text-muted-foreground mt-1">
                  {status === "pending"
                    ? "Please approve the transaction in your wallet"
                    : status === "confirming"
                    ? "Waiting for Stellar network confirmation..."
                    : status === "success"
                    ? `Successfully bought ${tokensOut?.toFixed(2) ?? "–"} ${outcome?.toUpperCase()} tokens`
                    : errorMsg?.startsWith("Transaction completed")
                    ? errorMsg
                    : errorMsg ?? "Something went wrong. Please try again."}
                </p>
              </div>

              {/* Trade details */}
              {(status === "success" || status === "confirming") && amount && (
                <div className="rounded-xl bg-muted/20 border border-border/30 p-4 space-y-2 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You spent</span>
                    <span className="font-medium">${amount} USDC</span>
                  </div>
                  {tokensOut && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You received</span>
                        <span
                          className={cn(
                            "font-semibold",
                            outcome === "yes" ? "text-yes" : "text-no"
                          )}
                        >
                          {tokensOut.toFixed(2)} {outcome?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 pt-1">
                        Tokens are on-chain — check your balance in the trade panel.
                        Freighter does not display custom Soroban tokens automatically.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {status === "success" && explorerUrl && (
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      View on Explorer
                    </a>
                  </Button>
                )}
                {(status === "success" || status === "error") && (
                  <Button
                    size="sm"
                    className={cn(
                      "flex-1",
                      status === "success"
                        ? "bg-yes hover:bg-yes/80 text-white"
                        : ""
                    )}
                    onClick={onClose}
                  >
                    {status === "success" ? "Done" : "Dismiss"}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
