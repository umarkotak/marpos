import { t, useI18n, formatLocale } from "@/lib/i18n";
import { money } from "@/lib/reports";
const labels = {
  "sale.created": "order_created",
  "sale.corrected": "order_updated",
  "sale.deleted": "order_deleted",
  "sale.restored": "order_restored",
};
const timestamp = (value) =>
  new Date(value).toLocaleString(formatLocale(), { timeZone: "Asia/Jakarta" });
function Snapshot({ label, sale }) {
  useI18n();
  return (
    <div>
      <strong>{label}</strong>
      <p>
        {[sale.buyer_name, sale.buyer_phone, sale.buyer_email]
          .filter(Boolean)
          .join(" · ") || t("no_buyer_details")}
      </p>
      {sale.items?.map((item) => (
        <p key={item.id}>
          {item.quantity} × {item.product_name} · {money(item.unit_price)}
          {item.addons?.map((addon) => (
            <small key={addon.id}>
              {addon.option_name} +{money(addon.price_delta)}
            </small>
          ))}
        </p>
      ))}
      <p>
        {t("tax")}{" "}
        {sale.tax_applied ? sale.tax_percentage + "%" : t("excluded")}
      </p>
      <p>
        {t("total")} {money(sale.grand_total)}
      </p>
    </div>
  );
}
export function AuditHistory({ entries, local = false }) {
  useI18n();
  return (
    <section className="correction-history">
      <h3>{t("order_history_log")}</h3>
      {!entries.length && (
        <p>
          {local
            ? t(
                "this_sale_is_waiting_for_sync_its_server_audit_record_will_appear_after_sync",
              )
            : t("no_audit_events_were_recorded_for_this_older_order")}
        </p>
      )}
      {entries.map((entry) => (
        <div className="audit-event" key={entry.id}>
          <div>
            <strong>
              {labels[entry.action] ? t(labels[entry.action]) : entry.action}
            </strong>
            <small>{timestamp(entry.created_at)} WIB</small>
          </div>
          <p>
            {entry.actor_name} · {entry.actor_email}
          </p>
          {entry.metadata.reason && <p>{entry.metadata.reason}</p>}
          {entry.metadata.completed_at && (
            <p>
              {t("sale_completed")} {timestamp(entry.metadata.completed_at)} WIB
            </p>
          )}
          {entry.metadata.before && entry.metadata.after && (
            <details>
              <summary>
                {t("view_changes_revision")} {entry.metadata.revision}
              </summary>
              <p>
                {t("cash_adjustment")} {money(entry.metadata.cash_delta)}
              </p>
              <div className="correction-values">
                <Snapshot
                  label={t("before")}
                  sale={{
                    ...entry.metadata.before.sale,
                    items: entry.metadata.before.items,
                  }}
                />
                <Snapshot label={t("after")} sale={entry.metadata.after} />
              </div>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
