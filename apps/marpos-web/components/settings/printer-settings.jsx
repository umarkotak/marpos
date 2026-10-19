import { useEffect, useState } from "react";
import { useRegister } from "@/components/register-provider";
import { t } from "@/lib/i18n";

export function PrinterSettings() {
  const { printerSettings, printerReady, savePrinterSettings, printReceipt, auth } = useRegister();
  const [method, setMethod] = useState(printerSettings.method);
  const [paperWidth, setPaperWidth] = useState(printerSettings.paperWidth);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMethod(printerSettings.method);
    setPaperWidth(printerSettings.paperWidth);
  }, [auth.store_id, printerSettings.method, printerSettings.paperWidth]);
  const changed = method !== printerSettings.method || paperWidth !== printerSettings.paperWidth;
  async function save() {
    setSaving(true);
    try {
      await savePrinterSettings({ method, paperWidth });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="settings-section" aria-labelledby="printer-heading">
      <div className="settings-section-copy">
        <span>{t("local_device")}</span>
        <h3 id="printer-heading">{t("receipt_printer")}</h3>
        <p>{t("printer_settings_local_help")}</p>
      </div>
      <div className="settings-fields">
        <label>
          {t("print_method")}
          <select value={method} disabled={!printerReady || saving} onChange={(event) => setMethod(event.target.value)}>
            <option value="browser">{t("browser_print_dialog")}</option>
            <option value="rawbt">{t("android_bluetooth_rawbt")}</option>
          </select>
        </label>
        <label>
          {t("printer_paper_width")}
          <select value={paperWidth} disabled={!printerReady || saving} onChange={(event) => setPaperWidth(Number(event.target.value))}>
            <option value={58}>58 mm</option>
            <option value={80}>80 mm</option>
          </select>
        </label>
        {method === "rawbt" ? (
          <div>
            <p>{t("rawbt_setup_help")}</p>
            <a href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noreferrer">{t("install_rawbt")}</a>
          </div>
        ) : <p>{t("browser_paper_width_help")}</p>}
        <button type="button" className="button primary" disabled={!printerReady || saving} onClick={save}>
          {saving ? t("saving_label") : t("save_printer_settings")}
        </button>
        <button type="button" className="button" disabled={!printerReady || saving || changed} onClick={() => printReceipt({
          sale: {
            reference: t("printer_test_receipt"), completed_at: new Date().toISOString(),
            subtotal: 0, tax_total: 0, grand_total: 0, tax_applied: false,
          },
          items: [],
        })}>
          {t("print_test_receipt")}
        </button>
        {changed && <small>{t("save_printer_before_test")}</small>}
      </div>
    </section>
  );
}
