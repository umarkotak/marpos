import { t, useI18n } from "@/lib/i18n";
import { shiftDate, storeDate } from "@/lib/reports";
export function RangeFilter({ range, onChange }) {
  useI18n();
  const today = storeDate();
  return (
    <div className="report-filter">
      <label>
        {t("period")}
        <select
          value={range.days}
          onChange={(event) => {
            const days = event.target.value;
            onChange(
              days === "custom"
                ? { ...range, days }
                : days === "last"
                  ? { days, count: 30, from: shiftDate(today, -29), to: today }
                  : {
                      days,
                      from: shiftDate(today, 1 - Number(days)),
                      to: today,
                    },
            );
          }}
        >
          <option value="7">{t("last_7_days")}</option>
          <option value="14">{t("last_14_days")}</option>
          <option value="30">{t("last_30_days")}</option>
          <option value="90">{t("last_90_days")}</option>
          <option value="last">{t("last_x_days")}</option>
          <option value="custom">{t("custom_dates")}</option>
        </select>
      </label>
      {range.days === "last" && (
        <label>
          {t("days")}
          <input
            type="number"
            min="1"
            max="366"
            step="1"
            value={range.count}
            onChange={(e) => {
              const count = e.target.value;
              onChange({
                ...range,
                count,
                from:
                  count &&
                  Number.isInteger(Number(count)) &&
                  Number(count) >= 1 &&
                  Number(count) <= 366
                    ? shiftDate(today, 1 - Number(count))
                    : "",
                to: today,
              });
            }}
          />
        </label>
      )}
      <label>
        {t("from")}
        <input
          type="date"
          required
          max={range.to}
          value={range.from}
          onChange={(e) =>
            onChange({ ...range, days: "custom", from: e.target.value })
          }
        />
      </label>
      <label>
        {t("to")}
        <input
          type="date"
          required
          min={range.from}
          max={today}
          value={range.to}
          onChange={(e) =>
            onChange({ ...range, days: "custom", to: e.target.value })
          }
        />
      </label>
    </div>
  );
}
