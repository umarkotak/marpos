import { money } from "@/lib/reports";
export function PrintReceipt({ detail, storeName }) {
  if (!detail) return null;
  const { sale, items } = detail;
  return (
    <section className="print-receipt">
      <h1>{storeName}</h1>
      <p>
        {sale.reference || `Temporary receipt ${sale.receipt_number}`}
        <br />
        {new Date(sale.completed_at).toLocaleString("en-GB")}
      </p>
      <p>
        {[sale.buyer_name, sale.buyer_phone, sale.buyer_email]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {sale.revision > 0 && <p>Corrected order · Revision {sale.revision}</p>}
      <hr />
      {items.map((item) => (
        <div key={item.id}>
          <div className="receipt-line">
            <span>
              {item.quantity} × {item.product_name}
            </span>
            <span>{money(item.line_total)}</span>
          </div>
          {item.addons?.map((addon) => (
            <small key={addon.id || addon.option_name}>
              + {addon.option_name}
              {addon.price_delta ? ` ${money(addon.price_delta)}` : ""}
              <br />
            </small>
          ))}
        </div>
      ))}
      <hr />
      <div className="receipt-line">
        <span>Subtotal</span>
        <span>{money(sale.subtotal)}</span>
      </div>
      <div className="receipt-line">
        <span>Tax</span>
        <span>{money(sale.tax_total)}</span>
      </div>
      <div className="receipt-line grand">
        <span>Total</span>
        <span>{money(sale.grand_total)}</span>
      </div>
      <p>Thank you.</p>
    </section>
  );
}
