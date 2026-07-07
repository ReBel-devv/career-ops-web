import { DetailDrawer } from "@/components/detail/detail-drawer";

/**
 * Intercepting route: client-side navigation to `/app/[num]` from the board or
 * the table opens the detail as a drawer over the current view. A hard refresh
 * or deep link falls through to the real `app/app/[num]/page.tsx` full page.
 */
export default async function InterceptedApplicationDetail({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num: numRaw } = await params;
  const num = Number.parseInt(numRaw, 10);
  if (!Number.isInteger(num) || num <= 0) return null;
  return <DetailDrawer num={num} />;
}
