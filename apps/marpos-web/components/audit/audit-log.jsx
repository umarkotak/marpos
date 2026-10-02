import { useEffect, useState } from "react";
import { getMeta, putMeta } from "@/lib/local-db";
import { navigate, updateQuery, useLocation } from "@/lib/navigation";
import { money } from "@/lib/reports";
import { api } from "@/lib/api";
const labels = {
  "sale.created": "Order created",
  "sale.corrected": "Order updated",
  "sale.deleted": "Order deleted",
  "sale.restored": "Order restored",
};
const timestamp = (value) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });
export function AuditLogPage({ db, auth }) {
  const { query } = useLocation();
  const action = query.get("action") || "",
    from = query.get("from") || "",
    to = query.get("to") || "";
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  const [rows, setRows] = useState([]),
    [status, setStatus] = useState("Loading audit log…"),
    [refresh, setRefresh] = useState(0);
  const params = new URLSearchParams({
    action,
    from,
    to,
    offset: String(offset),
  }).toString();
  useEffect(() => {
    let active = true;
    setRows([]);
    setStatus("Loading audit log…");
    async function load() {
      const key = `audit:${auth.store_id}:${params}`;
      try {
        const rows = await api(`/stores/${auth.store_id}/audit-logs?${params}`);
        if (db)
          await putMeta(db, key, { rows, saved_at: new Date().toISOString() });
        if (active) {
          setRows(rows);
          setStatus("Up to date. Dates use WIB.");
        }
      } catch (error) {
        if (!active) return;
        if (error.status === 401 || error.status === 403) {
          setStatus(error.message);
          return;
        }
        const saved = db ? await getMeta(db, key) : null;
        if (active) {
          setRows(saved?.rows || []);
          setStatus(
            saved
              ? `Offline · Saved ${timestamp(saved.saved_at)} WIB.`
              : error.message,
          );
        }
      }
    }
    load().catch(() => {
      if (active) setStatus("Could not load the audit log.");
    });
    return () => {
      active = false;
    };
  }, [auth.store_id, db, params, refresh]);
  const filter = (values) => updateQuery({ ...values, offset: null });
  return (
    <section className="products-page">
      <div className="page-heading">
        <small>STORE ACTIVITY</small>
        <h1>Audit log</h1>
        <p>
          See who changed orders and when. Audit records stay after an order is
          deleted.
        </p>
      </div>
      <div className="heading-row">
        <div className="report-filter">
          <label>
            Action
            <select
              value={action}
              onChange={(e) => filter({ action: e.target.value })}
            >
              <option value="">All actions</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              max={to || undefined}
              value={from}
              onChange={(e) => filter({ from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              min={from || undefined}
              value={to}
              onChange={(e) => filter({ to: e.target.value })}
            />
          </label>
        </div>
        <button
          className="button secondary"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh log
        </button>
      </div>
      <p role="status">{status}</p>
      <div className="table-card orders-scroll">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Time (WIB)</th>
              <th>Who</th>
              <th>Action</th>
              <th>Order</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{timestamp(row.created_at)}</td>
                <td>
                  <strong>{row.actor_name}</strong>
                  <small>{row.actor_email}</small>
                </td>
                <td>{labels[row.action] || row.action}</td>
                <td>
                  {row.entity_type === "sale" &&
                  (!row.entity_deleted || auth.is_superadmin) ? (
                    <a
                      href={`/orders?order=${row.entity_id}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                          return;
                        e.preventDefault();
                        navigate(`/orders?order=${row.entity_id}`);
                      }}
                    >
                      {row.reference}
                    </a>
                  ) : (
                    row.reference
                  )}
                  {row.entity_deleted && <small>Deleted</small>}
                </td>
                <td>
                  {row.metadata.reason || "—"}
                  {row.metadata.revision && (
                    <small>
                      Revision {row.metadata.revision} · Cash adjustment{" "}
                      {money(row.metadata.cash_delta)}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">No audit events in this period.</div>
        )}
      </div>
      <div className="form-actions">
        <button
          className="button secondary"
          disabled={!offset}
          onClick={() =>
            updateQuery({ offset: Math.max(0, offset - 50) }, false)
          }
        >
          Previous
        </button>
        <span>Page {Math.floor(offset / 50) + 1}</span>
        <button
          className="button secondary"
          disabled={rows.length < 50}
          onClick={() => updateQuery({ offset: offset + 50 }, false)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
