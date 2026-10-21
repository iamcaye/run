import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function SessionLoading() {
  return (
    <PageSkeleton title="Edit session" narrow>
      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}
