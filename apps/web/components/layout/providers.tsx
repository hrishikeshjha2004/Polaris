"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { apiClient } from "@/lib/api/client";
import { contractsDeployed } from "@/lib/contracts/client";

// ─── Store seeder ─────────────────────────────────────────────────────────────
// Loads REAL markets from the API into the Zustand store on app startup so
// that WebSocket `updateMarket(hexId, {yesPrice, noPrice})` calls can find the
// correct market to patch — mock IDs (like "btc-100k-2026") would never match
// the real hex IDs broadcast by the indexer.
// Falls back to mock markets when the backend is unreachable (offline dev).

function StoreInitializer() {
  const { markets, setMarkets } = useAppStore();

  const { data: apiResult } = useQuery({
    queryKey: ["markets-init"],
    queryFn: () => apiClient.markets.list({ limit: 50 }),
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (apiResult?.markets && apiResult.markets.length > 0) {
      setMarkets(apiResult.markets);
    } else if (!contractsDeployed && markets.length === 0) {
      // Offline dev: seed with mocks so offline WS simulation works.
      setMarkets(MOCK_MARKETS);
    }
  }, [apiResult]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StoreInitializer />
      {children}
    </QueryClientProvider>
  );
}
