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
  return (
    <div className="table-card orders-scroll">
      <table className="orders-table report-table">
        <thead>
          <tr>
            <th>{hourly ? "Hour (WIB)" : "Date (WIB)"}</th>
            <th>Orders</th>
            <th>Units sold</th>
            {earningsMode === "net" && (
              <>
                <th>Sales before tax</th>
                <th>Costs</th>
                <th>Income</th>
                <th>Expenses</th>
              </>
            )}
            <th>
              {earningsMode === "gross" ? "Gross earnings" : "Net earnings"}
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
              <td>{row.units.toLocaleString("en-GB")}</td>
              {earningsMode === "net" && (
                <>
                  <td>{money(row.revenue)}</td>
                  <td>{row.missing_costs ? "Incomplete" : money(row.cost)}</td>
                  <td>{money(row.income)}</td>
                  <td>{money(row.expense)}</td>
                </>
              )}
              <td>
                {earningsMode === "gross"
                  ? money(row.revenue)
                  : row.missing_costs
                    ? "Incomplete"
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
  const [range, setRange] = useRange();
  const [hours, setHours] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("Loading report…");
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
      setStatus("Loading report…");
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
              ? "Up to date · Includes pending records on this device."
              : cached
                ? `Offline · Saved ${new Date(cached.generated_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })}. Includes local records.`
                : "Offline · Only records on this device are available. This is a partial report.",
          );
          if (cached && !cached.products)
            setStatus(
              (text) => `${text} Product detail needs an online refresh.`,
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
      {busy ? "Loading…" : "Refresh report"}
    </button>
  );
  const earningsTabs = (
    <div
      className="report-tabs earnings-tabs"
      role="group"
      aria-label="Earnings view"
    >
      <button
        className={earningsMode === "gross" ? "active" : ""}
        aria-pressed={earningsMode === "gross"}
        onClick={() => changeEarningsMode("gross")}
      >
        Gross earnings
      </button>
      <button
        className={earningsMode === "net" ? "active" : ""}
        aria-pressed={earningsMode === "net"}
        onClick={() => changeEarningsMode("net")}
      >
        Net earnings
      </button>
    </div>
  );
  if (pathname.startsWith("/reports/day/") && !selected)
    return (
      <section className="products-page">
        <h1>Invalid report date</h1>
        <p>Use a valid date, ending today or earlier.</p>
        <button className="button secondary" onClick={returnToReport}>
          Back to reports
        </button>
      </section>
    );
  if (selected)
    return (
      <section className="products-page reports-page">
        <button className="link-button report-back" onClick={returnToReport}>
          ← Back to {reportTab === "overview" ? "overview" : "comparison"}
        </button>
        <div className="page-heading heading-row">
          <div>
            <small>DAY REPORT · WIB</small>
            <h1 ref={heading} tabIndex={-1}>
              {new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-GB", {
                timeZone: "UTC",
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </h1>
            <p>
              {selected === today ? "Today is still in progress. " : ""}Sales,
              products, and earnings for this day.
            </p>
          </div>
          {refreshButton}
        </div>
        {earningsTabs}
        <p className="report-status" role="status">
          {status}
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
          title="Hourly earnings and products sold"
          subtitle={
            earningsMode === "gross"
              ? "Sales before tax and units sold."
              : "Net earnings and units sold."
          }
          hourly
        />
        <ProductSales
          rows={products.filter((row) => row.date === selected)}
          earningsMode={earningsMode}
        />
        <div className="page-heading">
          <h2>Hourly detail</h2>
          <p>All 24 hours in Asia/Jakarta (WIB).</p>
        </div>
        <ReportDataTable rows={hourly} hourly earningsMode={earningsMode} />
      </section>
    );
  return (
    <section className="products-page reports-page">
      <div className="page-heading">
        <small>STORE PERFORMANCE</small>
        <h1 ref={heading} tabIndex={-1}>
          Reports
        </h1>
        <p>Understand earnings, product demand, and daily sales patterns.</p>
      </div>
      <div className="report-tabs" role="group" aria-label="Report views">
        <button
          className={reportTab === "overview" ? "active" : ""}
          aria-pressed={reportTab === "overview"}
          onClick={() => changeTab("overview")}
        >
          Overview
        </button>
        <button
          className={reportTab === "comparison" ? "active" : ""}
          aria-pressed={reportTab === "comparison"}
          onClick={() => changeTab("comparison")}
        >
          Comparison
        </button>
      </div>
      {earningsTabs}
      <div className="heading-row">
        <RangeFilter range={range} onChange={setRange} />
        {refreshButton}
      </div>
      <p className="report-status" role="status">
        {status} Dates use WIB.
      </p>
      {!valid ? (
        <p className="message">
          Select up to 366 days, ending today or earlier.
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
                title="Daily earnings and products sold"
                subtitle={`${range.from} to ${range.to}`}
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
            <h2>Daily detail</h2>
            <p>
              Select a date to open its day summary and hourly charts. Earnings
              exclude tax.
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
