import { I18n } from "i18n-js";
import { useEffect, useSyncExternalStore } from "react";
import en from "@/public/locales/en.json";
import id from "@/public/locales/id.json";

export { en };
export const i18n = new I18n({ en, id }, { defaultLocale: "en", locale: "en" });
const storageKey = "marpos-language";
const subscribe = (callback) => i18n.onChange(callback);
const snapshot = () => i18n.locale;
export const formatLocale = () => (i18n.locale === "id" ? "id-ID" : "en-GB");
export function useI18n() {
  return useSyncExternalStore(subscribe, snapshot, () => "en");
}
export function setLanguage(locale) {
  if (locale !== "en" && locale !== "id") return;
  i18n.locale = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(storageKey, locale);
  } catch {}
}
export function LanguagePreference() {
  useEffect(() => {
    try {
      setLanguage(localStorage.getItem(storageKey) || "en");
    } catch {}
    const changed = (event) => {
      if (event.key === storageKey) setLanguage(event.newValue || "en");
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  return null;
}
// Keep message keys so a language change also updates existing notices.
export const message = (key, options = {}) => ({ key, options });
export function t(key, options = {}) {
  return i18n.t(
    key,
    Object.fromEntries(
      Object.entries(options).map(([name, value]) => [
        name,
        value instanceof Date
          ? value.toLocaleString(formatLocale(), { timeZone: "Asia/Jakarta" })
          : value && typeof value === "object" && "key" in value
            ? translateMessage(value)
            : key === "api_error"
              ? translateMessage(value)
              : value,
      ]),
    ),
  );
}
const messageKeys = new Map(
  [...Object.entries(en), ...Object.entries(id)]
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [value, key]),
);
export function translateMessage(value) {
  if (!value) return "";
  if (typeof value === "object" && "key" in value)
    return t(value.key, value.options);
  return messageKeys.has(value) ? t(messageKeys.get(value)) : value;
}
export const categoryLabel = (value) =>
  ({ makanan: t("food"), minuman: t("drinks"), lainnya: t("other") })[value] ||
  value;
export const roleLabel = (value) =>
  ({
    owner: t("owner"),
    admin: t("admin"),
    manager: t("manager"),
    cashier: t("cashier"),
    viewer: t("view_only"),
  })[value] || value;
