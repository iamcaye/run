import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <PageSkeleton title="My plans">
      <div className="flex flex-col gap-3 lg:max-w-3xl">
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
      </div>
    </PageSkeleton>
  );
}
