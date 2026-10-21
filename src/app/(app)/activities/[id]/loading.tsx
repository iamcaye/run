import { Bone, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-3 gap-2">
        <Bone className="h-20 rounded-[18px]" />
        <Bone className="h-20 rounded-[18px]" />
        <Bone className="h-20 rounded-[18px]" />
      </div>
      <Bone className="h-56 rounded-[20px]" />
      <CardSkeleton lines={3} />
    </PageSkeleton>
  );
}
