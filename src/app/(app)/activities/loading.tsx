import { Bone, PageSkeleton } from "@/components/ui/skeleton";

export default function ActivitiesLoading() {
  return (
    <PageSkeleton title="Activities" action>
      <div aria-hidden className="flex flex-col gap-4 rounded-[20px] bg-surface p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="h-10" />
        ))}
      </div>
    </PageSkeleton>
  );
}
