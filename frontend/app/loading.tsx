import { Skeleton } from "@/components/ui/skeleton";

// App Router global loading UI — shown during route transitions and data fetches.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Skeleton className="h-8 w-56 mb-6" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/50 bg-card p-5 space-y-3"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-10" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
