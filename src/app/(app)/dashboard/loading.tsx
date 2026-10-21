import { Bone, CardSkeleton } from "@/components/ui/skeleton";

// Mirrors the dashboard's no-prompts layout: hero, today, stats and week on the left; charts on the right at lg.
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy aria-label="Loading" className="flex flex-col gap-3.5 lg:grid lg:grid-cols-12 lg:items-start">
      <div className="flex flex-col gap-3.5 lg:col-span-5">
        <div aria-hidden className="h-[370px] rounded-[22px] bg-hero motion-safe:animate-pulse" />
        <CardSkeleton lines={4} />
        <div className="grid grid-cols-3 gap-2">
          <Bone className="h-[104px] rounded-[18px]" />
          <Bone className="h-[104px] rounded-[18px]" />
          <Bone className="h-[104px] rounded-[18px]" />
        </div>
        <CardSkeleton lines={2} />
      </div>
      <div className="flex flex-col gap-3.5 lg:col-span-7">
        <Bone className="h-48 rounded-[20px]" />
        <div className="grid gap-3.5 xl:grid-cols-2">
          <Bone className="h-56 rounded-[20px]" />
          <Bone className="h-56 rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}
