import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function WorkoutLoading() {
  return (
    <PageSkeleton>
      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}
