import { Bone, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlanLoading() {
  return (
    <PageSkeleton>
      <Bone className="h-4 w-56" />
      <CardSkeleton lines={4} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={3} />
    </PageSkeleton>
  );
}
