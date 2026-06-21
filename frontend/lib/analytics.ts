// Thin wrapper over Vercel Analytics custom events + Sentry breadcrumbs.
// Use these to capture the core onboarding funnel:
//   wallet_connected -> account_funded -> prediction_placed
import { track } from "@vercel/analytics";
import * as Sentry from "@sentry/nextjs";

type Props = Record<string, string | number | boolean | null>;

export function trackEvent(name: string, props?: Props) {
  try {
    track(name, props);
    Sentry.addBreadcrumb({ category: "user-action", message: name, data: props ?? undefined });
  } catch {
    // analytics must never break the app
  }
}

export const analytics = {
  walletConnected: (address: string) =>
    trackEvent("wallet_connected", { address: address.slice(0, 6) }),
  accountFunded: (address: string) =>
    trackEvent("account_funded", { address: address.slice(0, 6) }),
  predictionPlaced: (marketId: string, side: "YES" | "NO", amount: number) =>
    trackEvent("prediction_placed", { marketId, side, amount }),
  liquidityAdded: (marketId: string, amount: number) =>
    trackEvent("liquidity_added", { marketId, amount }),
};
