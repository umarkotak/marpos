import { money } from "@/lib/reports";
const labels = {
  "sale.created": "Order created",
  "sale.corrected": "Order updated",
  "sale.deleted": "Order deleted",
  "sale.restored": "Order restored",
};
const timestamp = (value) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });
function Snapshot({ label, sale }) {
  return (
    <div>
      <strong>{label}</strong>
      <p>
        {[sale.buyer_name, sale.buyer_phone, sale.buyer_email]
          .filter(Boolean)
          .join(" · ") || "No buyer details"}
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
      <p>Tax: {sale.tax_applied ? sale.tax_percentage + "%" : "Excluded"}</p>
      <p>Total: {money(sale.grand_total)}</p>
    </div>
  );
}
export function AuditHistory({ entries, local = false }) {
  return (
    <section className="correction-history">
      <h3>Order history log</h3>
      {!entries.length && (
        <p>
          {local
            ? "This sale is waiting for sync. Its server audit record will appear after sync."
            : "No audit events were recorded for this older order."}
        </p>
      )}
      {entries.map((entry) => (
        <div className="audit-event" key={entry.id}>
          <div>
            <strong>{labels[entry.action] || entry.action}</strong>
            <small>{timestamp(entry.created_at)} WIB</small>
          </div>
          <p>
            {entry.actor_name} · {entry.actor_email}
          </p>
          {entry.metadata.reason && <p>{entry.metadata.reason}</p>}
          {entry.metadata.completed_at && (
            <p>Sale completed: {timestamp(entry.metadata.completed_at)} WIB</p>
          )}
          {entry.metadata.before && entry.metadata.after && (
            <details>
              <summary>
                View changes · Revision {entry.metadata.revision}
              </summary>
              <p>Cash adjustment: {money(entry.metadata.cash_delta)}</p>
              <div className="correction-values">
                <Snapshot
                  label="Before"
                  sale={{
                    ...entry.metadata.before.sale,
                    items: entry.metadata.before.items,
                  }}
                />
                <Snapshot label="After" sale={entry.metadata.after} />
              </div>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
