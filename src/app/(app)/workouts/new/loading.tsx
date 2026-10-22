import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewWorkoutLoading() {
  return (
    <PageSkeleton title="New workout">
      <CardSkeleton lines={5} />
    </PageSkeleton>
  );
}
