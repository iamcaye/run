import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function GoalsLoading() {
  return (
    <PageSkeleton title="Goals" action>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>
    </PageSkeleton>
  );
}
