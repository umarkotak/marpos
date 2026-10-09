import { t, useI18n } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { money } from "@/lib/reports";

export function IdrInput({
  value,
  onValueChange,
  min = 0,
  max = 1_000_000_000_000,
  ...props
}) {
  const locale = useI18n();
  const ref = useRef(null);
  const raw = value == null ? "" : String(value);

  useEffect(() => {
    ref.current?.setCustomValidity(
      raw !== "" && (Number(raw) < min || Number(raw) > max)
        ? t("amount_range", { min: money(min), max: money(max) })
        : "",
    );
  }, [raw, min, max, locale]);

  function change(event) {
    const input = event.currentTarget;
    const digitsBeforeCursor = input.value
      .slice(0, input.selectionStart)
      .replace(/\D/g, "").length;
    onValueChange(input.value.replace(/\D/g, ""));
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      let cursor = 0;
      let digits = 0;
      while (cursor < input.value.length && digits < digitsBeforeCursor) {
        if (/\d/.test(input.value[cursor])) digits++;
        cursor++;
      }
      input.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={raw === "" ? "" : money(Number(raw))}
      onChange={change}
      placeholder={money(0)}
    />
  );
}
