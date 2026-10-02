import { updateQuery, useLocation } from "@/lib/navigation";
import { shiftDate, storeDate } from "@/lib/reports";
const initialRange = () => ({
  days: "30",
  from: shiftDate(storeDate(), -29),
  to: storeDate(),
});
export function useRange() {
  const { query } = useLocation();
  const fallback = initialRange();
  const range = {
    days:
      query.get("period") ||
      (query.has("from") || query.has("to") ? "custom" : fallback.days),
    count: query.get("days") || 30,
    from: query.get("from") ?? fallback.from,
    to: query.get("to") ?? fallback.to,
  };
  return [
    range,
    (next) =>
      updateQuery({
        period: next.days,
        days: next.days === "last" ? next.count : null,
        from: next.from,
        to: next.to,
      }),
  ];
}
export const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const validRange = (range) =>
  validDate(range.from) &&
  validDate(range.to) &&
  range.from <= range.to &&
  range.to <= storeDate() &&
  (new Date(range.to) - new Date(range.from)) / 86400000 <= 365;
