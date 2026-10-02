import { money, emptyTotals, addTotals, shiftDate } from "@/lib/reports";
import { useEffect, useRef, useState } from "react";

export function ReportSummary({ rows, earningsMode = "gross" }) {
  const total = rows.reduce((sum, row) => addTotals(sum, row), emptyTotals());
  const cards = [
    [
      earningsMode === "gross" ? "Gross earnings" : "Net earnings",
      earningsMode === "gross"
        ? money(total.revenue)
        : total.missing_costs
          ? "Incomplete"
          : money(total.net),
      earningsMode === "gross"
        ? "Sales before tax"
        : "After production costs, other income, and expenses",
    ],
    ["Orders", total.orders.toLocaleString("en-GB"), "Completed orders"],
    [
      "Products sold",
      total.units.toLocaleString("en-GB"),
      "Units across all products",
    ],
    [
      "Average order",
      money(total.orders ? total.revenue / total.orders : 0),
      "Sales before tax per order",
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
          {total.missing_costs} sale items have no saved cost. Net earnings are
          incomplete.
        </p>
      )}
      <div className="report-cost-strip">
        <span>
          Production cost{" "}
          <b>{total.missing_costs ? "Incomplete" : money(total.cost)}</b>
        </span>
        <span>
          Other income <b>{money(total.income)}</b>
        </span>
        <span>
          Expenses <b>{money(total.expense)}</b>
        </span>
        <span>
          Tax collected <b>{money(total.tax)}</b>
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
    new Intl.NumberFormat("en-GB", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const earningsLabel = metric === "net" ? "Net earnings" : "Gross earnings";
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
          {earningsLabel} · left axis (IDR)
        </span>
        <span>
          <i className="units-key" />
          Products sold · right axis (units)
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
                ? "Incomplete costs"
                : money(values[active])}
            </span>
            <span>
              Products sold: {rows[active].units.toLocaleString("en-GB")}
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
              label = `${row.label}: ${value === null ? "Incomplete costs" : money(value)} ${earningsLabel.toLowerCase()}, ${row.units} products sold`;
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
                aria-label={onSelect ? `${label}. Open day report.` : label}
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
          ? "Select a date to view its hourly report. "
          : "Each bar covers one hour in WIB. "}
        {metric === "net"
          ? "Red bars show a loss. Grey bars have incomplete costs."
          : "Hover over a bar area to see both values."}
      </p>
    </section>
  );
}

export function ProductSales({ rows, earningsMode = "gross" }) {
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
          <h2>Products sold</h2>
          <p>
            Ranked by units sold. Includes selected add-on prices
            {earningsMode === "net" ? " and costs" : ""}.
          </p>
        </div>
        <span className="report-unit">{ranked.length} products</span>
      </div>
      <div className="orders-scroll">
        <table className="orders-table report-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Units sold</th>
              <th>Share of units</th>
              <th>
                {earningsMode === "gross"
                  ? "Gross earnings"
                  : "Sales before tax"}
              </th>
              {earningsMode === "net" && (
                <>
                  <th>Production cost</th>
                  <th>Profit after cost</th>
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
                <td>{row.units.toLocaleString("en-GB")}</td>
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
                      {row.missing_costs ? "Incomplete" : money(row.cost)}
                    </td>
                    <td>
                      {row.missing_costs
                        ? "Incomplete"
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
        <div className="empty">No products sold in this period.</div>
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
        <small>{hourly ? "Strongest sales hour" : "Strongest sales day"}</small>
        <strong>{best ? best.label : "No sales yet"}</strong>
        <p>
          {best
            ? `${money(best.revenue)} before tax`
            : "Complete a sale to see this insight."}
        </p>
      </div>
      <div>
        <small>Busiest sales hour</small>
        <strong>{peak ? `${peak[0]}:00–${peak[0]}:59 WIB` : "—"}</strong>
        <p>
          {peak
            ? `${peak[1].orders} order${peak[1].orders === 1 ? "" : "s"} ${hourly ? "on this day" : "across the selected period"}`
            : "Measured by completed orders."}
        </p>
      </div>
      <div>
        <small>
          {earningsMode === "gross" ? "Average sale per unit" : "Gross margin"}
        </small>
        <strong>
          {earningsMode === "gross"
            ? money(total.units ? total.revenue / total.units : 0)
            : margin}
        </strong>
        <p>
          {earningsMode === "gross"
            ? "Sales before tax divided by units sold."
            : "Sales less production cost, before other income and expenses."}
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
      ? "Incomplete"
      : metric === "orders" || metric === "units"
        ? (row?.[metric] || 0).toLocaleString("en-GB")
        : money(row?.[metric] || 0);
  return (
    <section className="report-panel report-chart">
      <div className="report-panel-heading">
        <div>
          <h2>Weekday comparison</h2>
          <p>
            Four weeks ending {endDate}. Days after the end date are excluded.
          </p>
        </div>
        <label>
          Compare
          <select value={metric} onChange={(e) => onMetric(e.target.value)}>
            <option value="revenue">Gross earnings</option>
            <option value="net">Net earnings</option>
            <option value="units">Products sold</option>
            <option value="orders">Orders</option>
            <option value="expense">Expenses</option>
          </select>
        </label>
      </div>
      <div className="chart-legend">
        {weeks.map((week, i) => (
          <span key={week.start}>
            <i style={{ background: week.color }} />
            {i === 0
              ? "Selected week"
              : `${i} week${i === 1 ? "" : "s"} earlier`}{" "}
            · {week.start}
          </span>
        ))}
      </div>
      <div className="comparison-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
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
                    aria-label={`${date}: ${format(row)}. Open day report.`}
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
        Select a bar to open the day report. Striped bars show a loss. The
        selected week is partial when the end date is before Sunday.
      </p>
      <div className="orders-scroll">
        <table className="orders-table report-table">
          <thead>
            <tr>
              <th>Weekday</th>
              {weeks.map((week) => (
                <th key={week.start}>Week of {week.start}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
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
