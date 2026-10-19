import { useEffect, useState } from "react";
import { getMeta, putMeta } from "@/lib/local-db";
import { message } from "@/lib/i18n";

const defaults = { method: "browser", paperWidth: 58 };
const validSettings = (value) => ({
  method: value?.method === "rawbt" ? "rawbt" : "browser",
  paperWidth: value?.paperWidth === 80 ? 80 : 58,
});

export function usePrinter(db, storeID, setNotice) {
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let active = true;
    if (db && storeID) {
      getMeta(db, `printer:${storeID}`).then((value) => {
        if (active) setSaved({ storeID, ...validSettings(value) });
      }).catch(() => {
        if (active) {
          setSaved(null);
          setNotice(message("printer_settings_load_failed"));
        }
      });
    }
    return () => { active = false; };
  }, [db, storeID, setNotice]);
  const ready = !!db && !!storeID && saved?.storeID === storeID;
  async function savePrinterSettings(value) {
    if (!ready) return;
    try {
      const settings = validSettings(value);
      await putMeta(db, `printer:${storeID}`, settings);
      setSaved({ storeID, ...settings });
      setNotice(message("printer_settings_saved"));
    } catch {
      setNotice(message("printer_settings_save_failed"));
    }
  }
  return {
    printerSettings: ready ? saved : defaults,
    printerReady: ready,
    savePrinterSettings,
  };
}
