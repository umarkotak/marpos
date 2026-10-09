import { t, message, useI18n, formatLocale } from "@/lib/i18n";
import { money, emptyTotals, addTotals, shiftDate } from "@/lib/reports";
import { useEffect, useRef, useState } from "react";

export function ReportSummary({ rows, earningsMode = "gross" }) {
  useI18n();
  const total = rows.reduce((sum, row) => addTotals(sum, row), emptyTotals());
  const cards = [
    [
      earningsMode === "gross" ? t("gross_earnings") : t("net_earnings"),
      earningsMode === "gross"
        ? money(total.revenue)
        : total.missing_costs
          ? t("incomplete")
          : money(total.net),
      earningsMode === "gross"
        ? t("sales_before_tax")
        : t("after_production_costs_other_income_and_expenses"),
    ],
    [
      t("orders_label"),
      total.orders.toLocaleString(formatLocale()),
      t("completed_orders"),
    ],
    [
      t("products_sold"),
      total.units.toLocaleString(formatLocale()),
      t("units_across_all_products"),
    ],
    [
      t("average_order"),
      money(total.orders ? total.revenue / total.orders : 0),
      t("sales_before_tax_per_order"),
    ],
  ];
  return (
    <>
      <div className="report-cards summary-cards">
        {cards.map(([label, value, caption], i) => (
          <div
            className={`report-card ${i === 0 ? "featured" : ""}`}
            key={label}
          >
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{caption}</span>
          </div>
        ))}
      </div>
      {earningsMode === "net" && total.missing_costs > 0 && (
        <p className="message">
          {t("missing_sale_costs", { count: total.missing_costs })}
        </p>
      )}
      <div className="report-cost-strip">
        <span>
          {t("production_cost")}{" "}
          <b>{total.missing_costs ? t("incomplete") : money(total.cost)}</b>
        </span>
        <span>
          {t("other_income")} <b>{money(total.income)}</b>
        </span>
        <span>
          {t("expenses")} <b>{money(total.expense)}</b>
        </span>
        <span>
          {t("tax_collected")} <b>{money(total.tax)}</b>
        </span>
      </div>
    </>
  );
}

export function TrendChart({
  rows,
  metric,
  title,
  subtitle,
  onSelect,
  hourly = false,
}) {
  useI18n();
  const container = useRef(null);
  const [width, setWidth] = useState(660);
  const [active, setActive] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, Math.round(entry.contentRect.width))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = 250,
    left = width < 500 ? 62 : 88,
    right = 48,
    top = 22,
    bottom = 42;
  const values = rows.map((row) =>
    metric === "net" && row.missing_costs ? null : row[metric] || 0,
  );
  const low = Math.min(0, ...values.filter((value) => value !== null)),
    high = Math.max(1, ...values.filter((value) => value !== null));
  const y = (value) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const step = (width - left - right) / Math.max(1, rows.length),
    zero = y(0);
  const unitHigh = Math.max(1, ...rows.map((row) => row.units || 0));
  const unitY = (value) =>
    top + (1 - value / unitHigh) * (height - top - bottom);
  const labelEvery = Math.max(1, Math.ceil(48 / step));
  const unitLabel = (value) =>
    new Intl.NumberFormat(formatLocale(), {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const earningsLabel =
    metric === "net" ? t("net_earnings") : t("gross_earnings");
  return (
    <section className="report-panel">
      <div className="report-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="trend-legend">
        <span>
          <i className="earnings-key" />
          {earningsLabel} {t("left_axis_idr")}
        </span>
        <span>
          <i className="units-key" />
          {t("products_sold_right_axis_units")}
        </span>
      </div>
      <div className="trend-chart" ref={container}>
        {active !== null && rows[active] && (
          <div className="trend-tooltip" role="tooltip">
            <strong>
              {hourly ? `${rows[active].label} WIB` : rows[active].label}
            </strong>
            <span>
              {earningsLabel}:{" "}
              {values[active] === null
                ? t("incomplete_costs")
                : money(values[active])}
            </span>
            <span>
              {t("products_sold_label")}{" "}
              {rows[active].units.toLocaleString(formatLocale())}
            </span>
          </div>
        )}
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="group"
          aria-label={title}
          onMouseLeave={() => setActive(null)}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const value = low + ((high - low) * i) / 4;
            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="#e7eeeb"
                />
                <text
                  x={left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                  fill="#778781"
                  fontSize="10"
                >
                  {unitLabel(value)}
                </text>
              </g>
            );
          })}
          {(unitHigh === 1
            ? [0, 1]
            : [0, Math.ceil(unitHigh / 2), unitHigh]
          ).map((value) => (
            <text
              key={value}
              x={width - right + 8}
              y={unitY(value) + 4}
              textAnchor="start"
              fill="#527ed4"
              fontSize="10"
            >
              {unitLabel(value)}
            </text>
          ))}
          <line
            x1={left}
            x2={width - right}
            y1={zero}
            y2={zero}
            stroke="#b7c9c2"
          />
          {rows.map((row, i) => {
            const value = values[i],
              x = left + i * step + step / 2,
              barY = value === null ? zero - 3 : Math.min(zero, y(value)),
              barHeight =
                value === null ? 3 : Math.max(3, Math.abs(y(value) - zero));
            return (
              <g key={row.label}>
                <rect
                  x={x - step * 0.3}
                  y={barY}
                  width={step * 0.6}
                  height={barHeight}
                  rx="3"
                  fill={
                    value === null
                      ? "#c4ceca"
                      : value < 0
                        ? "#c45151"
                        : "#168464"
                  }
                />
                {i % labelEvery === 0 && (
                  <text
                    x={x}
                    y={height - 17}
                    textAnchor="middle"
                    fill="#677b73"
                    fontSize="10"
                  >
                    {hourly
                      ? row.label.slice(0, 2)
                      : `${row.label.slice(8)}/${row.label.slice(5, 7)}`}
                  </text>
                )}
              </g>
            );
          })}
          <polyline
            points={rows
              .map(
                (row, i) =>
                  `${left + (i + 0.5) * step},${unitY(row.units || 0)}`,
              )
              .join(" ")}
            fill="none"
            stroke="#527ed4"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
          {active !== null && rows[active] && (
            <circle
              cx={left + (active + 0.5) * step}
              cy={unitY(rows[active].units || 0)}
              r="4"
              fill="#527ed4"
              stroke="white"
              strokeWidth="2"
              pointerEvents="none"
            />
          )}
          {rows.map((row, i) => {
            const value = values[i],
              label = t("chart_point", {
                date: row.label,
                value: value === null ? t("incomplete_costs") : money(value),
                earnings: earningsLabel.toLowerCase(),
                units: row.units,
              });
            return (
              <rect
                key={row.label}
                className="trend-target"
                x={left + i * step}
                y={top}
                width={step}
                height={height - top}
                fill="transparent"
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={
                  onSelect
                    ? t("open_day_report_label", { label: label })
                    : label
                }
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect?.(row.label)}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(row.label);
                  }
                }}
              />
            );
          })}
        </svg>
      </div>
      <p className="chart-help">
        {onSelect
          ? t("select_a_date_to_view_its_hourly_report")
          : t("each_bar_covers_one_hour_in_wib")}
        {metric === "net"
          ? t("red_bars_show_a_loss_grey_bars_have_incomplete_costs")
          : t("hover_over_a_bar_area_to_see_both_values")}
      </p>
    </section>
  );
}

export function ProductSales({ rows, earningsMode = "gross" }) {
  useI18n();
  const products = new Map();
  for (const row of rows) {
    if (!products.has(row.product_id))
      products.set(row.product_id, {
        ...row,
        units: 0,
        revenue: 0,
        cost: 0,
        missing_costs: 0,
      });
    const product = products.get(row.product_id);
    for (const key of ["units", "revenue", "cost", "missing_costs"])
      product[key] += row[key] || 0;
  }
  const ranked = [...products.values()].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue,
  );
  const allUnits = ranked.reduce((sum, row) => sum + row.units, 0);
  return (
    <section className="report-panel">
      <div className="report-panel-heading">
        <div>
          <h2>{t("products_sold")}</h2>
          <p>
            {t(
              earningsMode === "net"
                ? "product_ranking_costs"
                : "product_ranking_prices",
            )}
          </p>
        </div>
        <span className="report-unit">
          {t("product_count", { count: ranked.length })}
        </span>
      </div>
      <div className="orders-scroll">
        <table className="orders-table report-table">
          <thead>
            <tr>
              <th>{t("product")}</th>
              <th>{t("units_sold")}</th>
              <th>{t("share_of_units")}</th>
              <th>
                {earningsMode === "gross"
                  ? t("gross_earnings")
                  : t("sales_before_tax")}
              </th>
              {earningsMode === "net" && (
                <>
                  <th>{t("production_cost")}</th>
                  <th>{t("profit_after_cost")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row.product_id}>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.sku}</small>
                </td>
                <td>{row.units.toLocaleString(formatLocale())}</td>
                <td>
                  <span className="product-share">
                    <i
                      style={{
                        width: `${allUnits ? (row.units / allUnits) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  {allUnits ? ((row.units / allUnits) * 100).toFixed(1) : 0}%
                </td>
                <td>{money(row.revenue)}</td>
                {earningsMode === "net" && (
                  <>
                    <td>
                      {row.missing_costs ? t("incomplete") : money(row.cost)}
                    </td>
                    <td>
                      {row.missing_costs
                        ? t("incomplete")
                        : money(row.revenue - row.cost)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ranked.length && (
        <div className="empty">{t("no_products_sold_in_this_period")}</div>
      )}
    </section>
  );
}

export function ReportInsights({
  rows,
  hours,
  hourly = false,
  earningsMode = "gross",
}) {
  useI18n();
  const total = rows.reduce((sum, row) => addTotals(sum, row), emptyTotals());
  const best = [...rows]
    .filter((row) => row.orders > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];
  const hourTotals = new Map();
  for (const row of hours) {
    const key = String(row.hour).padStart(2, "0");
    if (!hourTotals.has(key)) hourTotals.set(key, emptyTotals());
    addTotals(hourTotals.get(key), row);
  }
  const peak = [...hourTotals]
    .filter(([, row]) => row.orders > 0)
    .sort(
      (a, b) => b[1].orders - a[1].orders || b[1].revenue - a[1].revenue,
    )[0];
  const margin =
    total.revenue && !total.missing_costs
      ? `${(((total.revenue - total.cost) / total.revenue) * 100).toFixed(1)}%`
      : "—";
  return (
    <div className="report-insights">
      <div>
        <small>
          {hourly ? t("strongest_sales_hour") : t("strongest_sales_day")}
        </small>
        <strong>{best ? best.label : t("no_sales_yet")}</strong>
        <p>
          {best
            ? t("amount_before_tax", { amount: money(best.revenue) })
            : t("complete_a_sale_to_see_this_insight")}
        </p>
      </div>
      <div>
        <small>{t("busiest_sales_hour")}</small>
        <strong>{peak ? `${peak[0]}:00–${peak[0]}:59 WIB` : "—"}</strong>
        <p>
          {peak
            ? t("busy_hour_orders", {
                orders: message("order_count", { count: peak[1].orders }),
                period: message(
                  hourly ? "on_this_day" : "across_the_selected_period",
                ),
              })
            : t("measured_by_completed_orders")}
        </p>
      </div>
      <div>
        <small>
          {earningsMode === "gross"
            ? t("average_sale_per_unit")
            : t("gross_margin")}
        </small>
        <strong>
          {earningsMode === "gross"
            ? money(total.units ? total.revenue / total.units : 0)
            : margin}
        </strong>
        <p>
          {earningsMode === "gross"
            ? t("sales_before_tax_divided_by_units_sold")
            : t("sales_less_production_cost_before_other_income_and_expenses")}
        </p>
      </div>
    </div>
  );
}

export function ComparisonChart({
  daily,
  endDate,
  metric,
  onMetric,
  onSelect,
}) {
  useI18n();
  const weekday = (new Date(`${endDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDate(endDate, -weekday);
  const weeks = [0, 1, 2, 3].map((week) => ({
    start: shiftDate(monday, -week * 7),
    color: ["#168464", "#527ed4", "#9872c4", "#d59b42"][week],
  }));
  const max = Math.max(
    1,
    ...weeks.flatMap((week) =>
      Array.from({ length: 7 }, (_, day) =>
        Math.abs(daily.get(shiftDate(week.start, day))?.[metric] || 0),
      ),
    ),
  );
  const format = (row) =>
    metric === "net" && row?.missing_costs
      ? t("incomplete")
      : metric === "orders" || metric === "units"
        ? (row?.[metric] || 0).toLocaleString(formatLocale())
        : money(row?.[metric] || 0);
  return (
    <section className="report-panel report-chart">
      <div className="report-panel-heading">
        <div>
          <h2>{t("weekday_comparison")}</h2>
          <p>{t("four_weeks_ending", { date: endDate })} </p>
        </div>
        <label>
          {t("compare")}
          <select value={metric} onChange={(e) => onMetric(e.target.value)}>
            <option value="revenue">{t("gross_earnings")}</option>
            <option value="net">{t("net_earnings")}</option>
            <option value="units">{t("products_sold")}</option>
            <option value="orders">{t("orders_label")}</option>
            <option value="expense">{t("expenses")}</option>
          </select>
        </label>
      </div>
      <div className="chart-legend">
        {weeks.map((week, i) => (
          <span key={week.start}>
            <i style={{ background: week.color }} />
            {i === 0
              ? t("selected_week")
              : t("week_count", { count: i })} · {week.start}
          </span>
        ))}
      </div>
      <div className="comparison-grid">
        {[
          t("mon"),
          t("tue"),
          t("wed"),
          t("thu"),
          t("fri"),
          t("sat"),
          t("sun"),
        ].map((day, i) => (
          <div className="comparison-day" key={day}>
            <div className="comparison-bars">
              {weeks.map((week) => {
                const date = shiftDate(week.start, i),
                  row = daily.get(date),
                  value = row?.[metric] || 0,
                  incomplete = metric === "net" && row?.missing_costs > 0;
                return date > endDate ? (
                  <span className="future-bar" key={date} />
                ) : (
                  <button
                    key={date}
                    className={`comparison-bar ${value < 0 ? "negative" : ""}`}
                    style={{
                      height: `${incomplete ? 3 : Math.max(3, (Math.abs(value) / max) * 155)}px`,
                      background: incomplete ? "#c4ceca" : week.color,
                    }}
                    aria-label={t("open_date_report", {
                      date: date,
                      value: format(row),
                    })}
                    title={`${date}: ${format(row)}`}
                    onClick={() => onSelect(date)}
                  />
                );
              })}
            </div>
            <strong>{day}</strong>
          </div>
        ))}
      </div>
      <p className="chart-help">
        {t(
          "select_a_bar_to_open_the_day_report_striped_bars_show_a_loss_the_selected_week_is_partial_when_the_end_date_is_before_sunday",
        )}
      </p>
      <div className="orders-scroll">
        <table className="orders-table report-table">
          <thead>
            <tr>
              <th>{t("weekday")}</th>
              {weeks.map((week) => (
                <th key={week.start}>
                  {t("week_of")} {week.start}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              t("monday"),
              t("tuesday"),
              t("wednesday"),
              t("thursday"),
              t("friday"),
              t("saturday"),
              t("sunday"),
            ].map((day, i) => (
              <tr key={day}>
                <td>{day}</td>
                {weeks.map((week) => {
                  const date = shiftDate(week.start, i);
                  return (
                    <td key={date}>
                      {date > endDate ? (
                        "—"
                      ) : (
                        <button
                          className="link-button"
                          onClick={() => onSelect(date)}
                        >
                          {format(daily.get(date))}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
