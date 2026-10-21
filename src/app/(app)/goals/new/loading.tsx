import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewGoalLoading() {
  return (
    <PageSkeleton title="New goal" narrow>
      <CardSkeleton lines={6} />
    </PageSkeleton>
  );
}
