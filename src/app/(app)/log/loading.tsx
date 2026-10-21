import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function LogLoading() {
  return (
    <PageSkeleton title="Quick log" narrow>
      <CardSkeleton lines={4} />
      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}
