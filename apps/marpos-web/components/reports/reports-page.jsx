import { t, message, translateMessage, useI18n, formatLocale } from "@/lib/i18n";
import { updateQuery, useLocation } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMeta, localFinance, localSales, putMeta } from "@/lib/local-db";
import {
  addTotals,
  dateRange,
  emptyTotals,
  money,
  reportHours,
  reportProducts,
  shiftDate,
  storeDate,
} from "@/lib/reports";

import {
  ReportSummary,
  TrendChart,
  ProductSales,
  ReportInsights,
  ComparisonChart,
} from "@/components/reports/report-charts";

import { api } from "@/lib/api";
import { RangeFilter } from "@/components/reports/range-filter";
import { useRange, validDate, validRange } from "@/hooks/use-report-range";
function ReportDataTable({
  rows,
  onSelect,
  hourly = false,
  earningsMode = "gross",
}) {
  useI18n();
  return (
    <div className="table-card orders-scroll">
      <table className="orders-table report-table">
        <thead>
          <tr>
            <th>{hourly ? t("hour_wib") : t("date_wib")}</th>
            <th>{t("orders_label")}</th>
            <th>{t("units_sold")}</th>
            {earningsMode === "net" && (
              <>
                <th>{t("sales_before_tax")}</th>
                <th>{t("costs")}</th>
                <th>{t("income")}</th>
                <th>{t("expenses")}</th>
              </>
            )}
            <th>
              {earningsMode === "gross"
                ? t("gross_earnings")
                : t("net_earnings")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>
                {onSelect ? (
                  <button
                    className="link-button"
                    onClick={() => onSelect(row.label)}
                  >
                    {row.label}
                  </button>
                ) : (
                  row.label
                )}
              </td>
              <td>{row.orders}</td>
              <td>{row.units.toLocaleString(formatLocale())}</td>
              {earningsMode === "net" && (
                <>
                  <td>{money(row.revenue)}</td>
                  <td>
                    {row.missing_costs ? t("incomplete") : money(row.cost)}
                  </td>
                  <td>{money(row.income)}</td>
                  <td>{money(row.expense)}</td>
                </>
              )}
              <td>
                {earningsMode === "gross"
                  ? money(row.revenue)
                  : row.missing_costs
                    ? t("incomplete")
                    : money(row.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage({ db, auth, pending }) {
  useI18n();
  const [range, setRange] = useRange();
  const [hours, setHours] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState(message("loading_report"));
  const { pathname, query } = useLocation();
  const reportTab =
    pathname === "/reports/comparison" || query.get("view") === "comparison"
      ? "comparison"
      : "overview";
  const earningsMode = query.get("earnings") === "net" ? "net" : "gross";
  const day = pathname.match(/^\/reports\/day\/(\d{4}-\d{2}-\d{2})$/)?.[1];
  const selected = day && validDate(day) && day <= storeDate() ? day : null;
  const queryMetric =
    query.get("metric") || (earningsMode === "net" ? "net" : "revenue");
  const metric = ["revenue", "net", "units", "orders", "expense"].includes(
    queryMetric,
  )
    ? queryMetric
    : "revenue";
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const heading = useRef(null);
  const today = storeDate();
  const valid = validRange(range);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  function openDay(date) {
    updateQuery(
      { view: reportTab, period: range.days, from: range.from, to: range.to },
      false,
      `/reports/day/${date}`,
    );
  }
  function returnToReport() {
    updateQuery(
      { view: null },
      false,
      reportTab === "comparison" ? "/reports/comparison" : "/reports",
    );
  }
  function changeTab(tab) {
    updateQuery(
      { view: null },
      false,
      tab === "comparison" ? "/reports/comparison" : "/reports",
    );
  }
  function changeEarningsMode(mode) {
    updateQuery({
      earnings: mode === "net" ? "net" : null,
      metric: mode === "net" ? "net" : "revenue",
    });
  }
  function changeMetric(value) {
    updateQuery({
      metric: value,
      earnings:
        value === "net"
          ? "net"
          : value === "revenue"
            ? null
            : query.get("earnings"),
    });
  }
  const comparisonStart = valid
    ? shiftDate(
        range.to,
        -((new Date(`${range.to}T00:00:00Z`).getUTCDay() + 6) % 7) - 21,
      )
    : range.from;
  const loadRange = selected
    ? {
        from:
          selected < range.from && selected < comparisonStart
            ? selected
            : range.from,
        to: selected > range.to ? selected : range.to,
      }
    : range;

  useEffect(() => {
    let active = true;
    async function load() {
      if (!db || !valid) return;
      setBusy(true);
      setStatus(message("loading_report"));
      const key = `report:${auth.store_id}:${loadRange.from}:${loadRange.to}:${today}`;
      try {
        let cached = await getMeta(db, key),
          online = false;
        try {
          cached = await api(
            `/stores/${auth.store_id}/reports?from=${loadRange.from}&to=${loadRange.to}`,
          );
          await putMeta(db, key, cached);
          online = true;
        } catch (error) {
          if (error.status === 403 || error.status === 401) throw error;
        }
        const sales = await localSales(db, auth.store_id),
          entries = await localFinance(db, auth.store_id);
        const localOnly = !cached;
        const include = (row) =>
          localOnly ||
          row.sync_status === "pending" ||
          new Date(row.synced_at) > new Date(cached.generated_at);
        const local = sales.filter(include);
        const data = reportHours(
          cached?.hours || [],
          local,
          entries.filter(include),
        );
        const productData = reportProducts(
          cached?.products || [],
          local,
          (cached?.hours || []).flatMap((row) => row.ids || []),
        );
        if (active) {
          setHours(data);
          setProducts(productData);
          setStatus(
            online
              ? message("up_to_date_includes_pending_records_on_this_device")
              : cached
                ? message("offline_report_saved", {
                    saved: new Date(cached.generated_at),
                  })
                : message(
                    "offline_only_records_on_this_device_are_available_this_is_a_partial_report",
                  ),
          );
          if (cached && !cached.products)
            setStatus((text) =>
              message("report_product_refresh", { status: text }),
            );
        }
      } catch (error) {
        if (active) {
          setHours([]);
          setProducts([]);
          setStatus(error.message);
        }
      } finally {
        if (active) setBusy(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [
    db,
    auth.store_id,
    loadRange.from,
    loadRange.to,
    valid,
    pending,
    refresh,
    today,
  ]);
  const daily = useMemo(() => {
    const map = new Map();
    for (const row of hours) {
      if (!map.has(row.date)) map.set(row.date, emptyTotals());
      addTotals(map.get(row.date), row);
    }
    return map;
  }, [hours]);
  const days = valid
    ? dateRange(range.from, range.to).map((date) => ({
        ...emptyTotals(),
        ...daily.get(date),
        label: date,
      }))
    : [];
  const periodHours = hours.filter(
    (row) => row.date >= range.from && row.date <= range.to,
  );
  const periodProducts = products.filter(
    (row) => row.date >= range.from && row.date <= range.to,
  );
  const dayHours = selected ? hours.filter((row) => row.date === selected) : [];
  const hourly = selected
    ? Array.from({ length: 24 }, (_, hour) => ({
        ...dayHours
          .filter((row) => row.hour === hour)
          .reduce((sum, row) => addTotals(sum, row), emptyTotals()),
        label: `${String(hour).padStart(2, "0")}:00`,
      }))
    : [];
  const refreshButton = (
    <button
      className="button secondary"
      disabled={busy || !valid}
      onClick={() => setRefresh((n) => n + 1)}
    >
      {busy ? t("loading") : t("refresh_report")}
    </button>
  );
  const earningsTabs = (
    <div
      className="report-tabs earnings-tabs"
      role="group"
      aria-label={t("earnings_view")}
    >
      <button
        className={earningsMode === "gross" ? "active" : ""}
        aria-pressed={earningsMode === "gross"}
        onClick={() => changeEarningsMode("gross")}
      >
        {t("gross_earnings")}
      </button>
      <button
        className={earningsMode === "net" ? "active" : ""}
        aria-pressed={earningsMode === "net"}
        onClick={() => changeEarningsMode("net")}
      >
        {t("net_earnings")}
      </button>
    </div>
  );
  if (pathname.startsWith("/reports/day/") && !selected)
    return (
      <section className="products-page">
        <h1>{t("invalid_report_date")}</h1>
        <p>{t("use_a_valid_date_ending_today_or_earlier")}</p>
        <button className="button secondary" onClick={returnToReport}>
          {t("back_to_reports")}
        </button>
      </section>
    );
  if (selected)
    return (
      <section className="products-page reports-page">
        <button className="link-button report-back" onClick={returnToReport}>
          {t(
            reportTab === "overview"
              ? "back_to_overview"
              : "back_to_comparison",
          )}
        </button>
        <div className="page-heading heading-row">
          <div>
            <small>{t("day_report_wib")}</small>
            <h1 ref={heading} tabIndex={-1}>
              {new Date(`${selected}T00:00:00Z`).toLocaleDateString(
                formatLocale(),
                {
                  timeZone: "UTC",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              )}
            </h1>
            <p>
              {selected === today ? t("today_is_still_in_progress") : ""}
              {t("sales_products_and_earnings_for_this_day")}
            </p>
          </div>
          {refreshButton}
        </div>
        {earningsTabs}
        <p className="report-status" role="status">
          {translateMessage(status)}
        </p>
        <ReportSummary rows={hourly} earningsMode={earningsMode} />
        <ReportInsights
          rows={hourly}
          hours={dayHours}
          hourly
          earningsMode={earningsMode}
        />
        <TrendChart
          rows={hourly}
          metric={earningsMode === "gross" ? "revenue" : "net"}
          title={t("hourly_earnings_and_products_sold")}
          subtitle={
            earningsMode === "gross"
              ? t("sales_before_tax_and_units_sold")
              : t("net_earnings_and_units_sold")
          }
          hourly
        />
        <ProductSales
          rows={products.filter((row) => row.date === selected)}
          earningsMode={earningsMode}
        />
        <div className="page-heading">
          <h2>{t("hourly_detail")}</h2>
          <p>{t("all_24_hours_in_asia_jakarta_wib")}</p>
        </div>
        <ReportDataTable rows={hourly} hourly earningsMode={earningsMode} />
      </section>
    );
  return (
    <section className="products-page reports-page">
      <div className="page-heading">
        <small>{t("store_performance")}</small>
        <h1 ref={heading} tabIndex={-1}>
          {t("reports")}
        </h1>
        <p>
          {t("understand_earnings_product_demand_and_daily_sales_patterns")}
        </p>
      </div>
      <div className="report-tabs" role="group" aria-label={t("report_views")}>
        <button
          className={reportTab === "overview" ? "active" : ""}
          aria-pressed={reportTab === "overview"}
          onClick={() => changeTab("overview")}
        >
          {t("overview")}
        </button>
        <button
          className={reportTab === "comparison" ? "active" : ""}
          aria-pressed={reportTab === "comparison"}
          onClick={() => changeTab("comparison")}
        >
          {t("comparison")}
        </button>
      </div>
      {earningsTabs}
      <div className="heading-row">
        <RangeFilter range={range} onChange={setRange} />
        {refreshButton}
      </div>
      <p className="report-status" role="status">
        {translateMessage(status)} {t("dates_use_wib")}
      </p>
      {!valid ? (
        <p className="message">
          {t("select_up_to_366_days_ending_today_or_earlier")}
        </p>
      ) : (
        <>
          <ReportSummary rows={days} earningsMode={earningsMode} />
          {reportTab === "overview" ? (
            <>
              <ReportInsights
                rows={days}
                hours={periodHours}
                earningsMode={earningsMode}
              />
              <TrendChart
                rows={days}
                metric={earningsMode === "gross" ? "revenue" : "net"}
                title={t("daily_earnings_and_products_sold")}
                subtitle={t("date_period", { from: range.from, to: range.to })}
                onSelect={openDay}
              />
              <ProductSales rows={periodProducts} earningsMode={earningsMode} />
            </>
          ) : (
            <ComparisonChart
              daily={daily}
              endDate={range.to}
              metric={metric}
              onMetric={changeMetric}
              onSelect={openDay}
            />
          )}
          <div className="page-heading">
            <h2>{t("daily_detail")}</h2>
            <p>
              {t(
                "select_a_date_to_open_its_day_summary_and_hourly_charts_earnings_exclude_tax",
              )}
            </p>
          </div>
          <ReportDataTable
            rows={[...days].reverse()}
            onSelect={openDay}
            earningsMode={earningsMode}
          />
        </>
      )}
    </section>
  );
}
