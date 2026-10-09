import { t, useI18n } from "@/lib/i18n";
import { StoreSettings } from "@/components/settings/store-settings";
import { useRegister } from "@/components/register-provider";
export default function SettingsPage() {
  useI18n();
  const { auth, saveSettings, appConfig, clearStore, clearing } = useRegister();
  return (
    <section className="products-page settings-page">
      <div className="page-heading">
        <small>{t("store_label")}</small>
        <h1>{t("store_settings")}</h1>
        <p>{t("manage_how_this_store_appears_and_works")}</p>
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
