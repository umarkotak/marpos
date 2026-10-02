import { shiftDate, storeDate } from "@/lib/reports";
export function RangeFilter({ range, onChange }) {
  const today = storeDate();
  return (
    <div className="report-filter">
      <label>
        Period
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
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="last">Last X days</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {range.days === "last" && (
        <label>
          Days
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
        From
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
        To
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
