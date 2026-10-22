import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlanBuilderLoading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[170px_1fr_330px]">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={6} />
        <CardSkeleton lines={6} className="hidden lg:flex" />
      </div>
    </PageSkeleton>
  );
}
