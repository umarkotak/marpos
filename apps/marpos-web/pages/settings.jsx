import { StoreSettings } from "@/components/settings/store-settings";
import { useRegister } from "@/components/register-provider";
export default function SettingsPage() {
  const { auth, saveSettings, appConfig, clearStore, clearing } = useRegister();
  return (
    <section className="products-page settings-page">
      <div className="page-heading">
        <small>STORE</small>
        <h1>Store settings</h1>
        <p>Manage how this store appears and works.</p>
      </div>
      <StoreSettings
        auth={auth}
        onSave={saveSettings}
        dangerZoneEnabled={appConfig?.features?.danger_zone}
        onClear={clearStore}
        clearing={clearing}
      />
    </section>
  );
}
