import { Skeleton } from "@/components/ui/skeleton";

/** Shared placeholder for routes whose real UI lands in a later milestone. */
export function PlaceholderPage({
  title,
  description,
  milestone,
}: {
  title: string;
  description: string;
  milestone: string;
}) {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <span className="rounded-sm border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {milestone}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3" aria-hidden>
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
