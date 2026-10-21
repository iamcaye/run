import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function GoalLoading() {
  return (
    <PageSkeleton>
      <CardSkeleton lines={4} />
      <CardSkeleton lines={3} />
    </PageSkeleton>
  );
}
