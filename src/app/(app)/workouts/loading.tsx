import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function WorkoutsLoading() {
  return (
    <PageSkeleton title="My workouts" action>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    </PageSkeleton>
  );
}
