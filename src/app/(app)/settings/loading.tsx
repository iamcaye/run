import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <PageSkeleton title="Settings" narrow>
      <CardSkeleton lines={6} />
      <CardSkeleton lines={3} />
    </PageSkeleton>
  );
}
