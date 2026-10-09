import { t, message, translateMessage, useI18n, formatLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { getMeta, putMeta } from "@/lib/local-db";
import { navigate, updateQuery, useLocation } from "@/lib/navigation";
import { money } from "@/lib/reports";
import { api } from "@/lib/api";
const labels = {
  "sale.created": "order_created",
  "sale.corrected": "order_updated",
  "sale.deleted": "order_deleted",
  "sale.restored": "order_restored",
};
const timestamp = (value) =>
  new Date(value).toLocaleString(formatLocale(), { timeZone: "Asia/Jakarta" });
export function AuditLogPage({ db, auth }) {
  useI18n();
  const { query } = useLocation();
  const action = query.get("action") || "",
    from = query.get("from") || "",
    to = query.get("to") || "";
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  const [rows, setRows] = useState([]),
    [status, setStatus] = useState(message("loading_audit_log")),
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
    setStatus(message("loading_audit_log"));
    async function load() {
      const key = `audit:${auth.store_id}:${params}`;
      try {
        const rows = await api(`/stores/${auth.store_id}/audit-logs?${params}`);
        if (db)
          await putMeta(db, key, { rows, saved_at: new Date().toISOString() });
        if (active) {
          setRows(rows);
          setStatus(message("up_to_date_dates_use_wib"));
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
              ? message("offline_saved", { saved: new Date(saved.saved_at) })
              : error.message,
          );
        }
      }
    }
    load().catch(() => {
      if (active) setStatus(message("could_not_load_the_audit_log"));
    });
    return () => {
      active = false;
    };
  }, [auth.store_id, db, params, refresh]);
  const filter = (values) => updateQuery({ ...values, offset: null });
  return (
    <section className="products-page">
      <div className="page-heading">
        <small>{t("store_activity")}</small>
        <h1>{t("audit_log")}</h1>
        <p>
          {t(
            "see_who_changed_orders_and_when_audit_records_stay_after_an_order_is_deleted",
          )}
        </p>
      </div>
      <div className="heading-row">
        <div className="report-filter">
          <label>
            {t("action")}
            <select
              value={action}
              onChange={(e) => filter({ action: e.target.value })}
            >
              <option value="">{t("all_actions")}</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("from")}
            <input
              type="date"
              max={to || undefined}
              value={from}
              onChange={(e) => filter({ from: e.target.value })}
            />
          </label>
          <label>
            {t("to")}
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
          {t("refresh_log")}
        </button>
      </div>
      <p role="status">{translateMessage(status)}</p>
      <div className="table-card orders-scroll">
        <table className="orders-table">
          <thead>
            <tr>
              <th>{t("time_wib")}</th>
              <th>{t("who")}</th>
              <th>{t("action")}</th>
              <th>{t("order")}</th>
              <th>{t("details")}</th>
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
                <td>
                  {labels[row.action] ? t(labels[row.action]) : row.action}
                </td>
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
                  {row.entity_deleted && <small>{t("deleted")}</small>}
                </td>
                <td>
                  {row.metadata.reason || "—"}
                  {row.metadata.revision && (
                    <small>
                      {t("revision")} {row.metadata.revision}{" "}
                      {t("cash_adjustment_label")}{" "}
                      {money(row.metadata.cash_delta)}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">{t("no_audit_events_in_this_period")}</div>
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
          {t("previous")}
        </button>
        <span>
          {t("page")} {Math.floor(offset / 50) + 1}
        </span>
        <button
          className="button secondary"
          disabled={rows.length < 50}
          onClick={() => updateQuery({ offset: offset + 50 }, false)}
        >
          {t("next")}
        </button>
      </div>
    </section>
  );
}
