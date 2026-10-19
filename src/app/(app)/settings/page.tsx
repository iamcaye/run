import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card } from "@/components/ui/form";
import { ImportSection } from "@/components/import/import-section";
import { DeleteAccount } from "@/components/settings/delete-account";
import {
  AvailabilityForm,
  HeartRateForm,
  PreferencesForm,
  ProfileForm,
} from "@/components/settings/settings-forms";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Settings · Race Training" };

export default async function SettingsPage() {
  const { user, settings, scope } = await requireUserContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Settings</h1>
      <Card title="Profile" action={<span className="text-sm text-accent"><SignOutButton /></span>}>
        <p className="-mt-2 text-sm text-muted">{user.email}</p>
        <ProfileForm name={user.name} />
      </Card>
      <Card title="Preferences">
        <PreferencesForm timezone={settings.timezone} units={settings.units} weekStart={settings.weekStart} />
      </Card>
      <Card title="Availability">
        <AvailabilityForm
          runDays={settings.runDays}
          longRunDay={settings.longRunDay}
          maxRunsPerWeek={settings.maxRunsPerWeek}
        />
      </Card>
      <Card title="Heart rate">
        <HeartRateForm maxHr={settings.maxHr} restHr={settings.restHr} />
      </Card>
      <Card title="Apple Watch sync (Health Auto Export)">
        <ImportSection scope={scope} />
      </Card>
      <Card title="Danger zone">
        <DeleteAccount />
      </Card>
    </div>
  );
}
