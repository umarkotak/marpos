import { t, useI18n, formatLocale } from "@/lib/i18n";
import { money } from "@/lib/reports";
export function PrintReceipt({ detail, storeName, storeAddress, paperWidth = 58 }) {
  useI18n();
  if (!detail) return null;
  const { sale, items } = detail;
  return (
    <section className="print-receipt" data-paper-width={paperWidth}>
      <h1>{storeName}</h1>
      {storeAddress && <p>{storeAddress}</p>}
      <p>
        {sale.reference ||
          t("temporary_receipt_number", { number: sale.receipt_number })}
        <br />
        {new Date(sale.completed_at).toLocaleString(formatLocale(), {
          timeZone: "Asia/Jakarta",
        })} WIB
      </p>
      {sale.cashier_name && <p>{t("cashier")}: {sale.cashier_name}</p>}
      {["buyer_name", "buyer_phone", "buyer_email"].map((key) =>
        sale[key] ? <p key={key}>{t(key)}: {sale[key]}</p> : null,
      )}
      {sale.payment_method_note && (
        <p>{t("payment_method_receipt")}: {t(`payment_method_${sale.payment_method_note}`)}</p>
      )}
      {sale.revision > 0 && (
        <p>
          {t("corrected_order_revision")} {sale.revision}
        </p>
      )}
      <hr />
      {items.map((item) => (
        <div className="receipt-item" key={item.id}>
          <div className="receipt-line">
            <span>
              {item.quantity} × {item.product_name}
            </span>
            <span>{money(item.line_total)}</span>
          </div>
          <div className="receipt-item-price">
            <small>{item.quantity} × {money(item.unit_price)}</small>
            {item.discount_total > 0 && (
              <small className="receipt-item-discount">{t("discount")}: −{money(item.discount_total)}{item.discount_per_unit > 0 && <><br />({money(item.discount_per_unit)} {t("per_unit")})</>}</small>
            )}
          </div>
          {item.product_description && <small>{item.product_description}<br /></small>}
          {item.addons?.map((addon) => (
            <small key={addon.id || addon.option_name}>
              + {addon.option_name}
              {` ${money(addon.price_delta)}`}
              <br />
            </small>
          ))}
        </div>
      ))}
      <hr />
      <div className="receipt-line">
        <span>{t("subtotal")}</span>
        <span>{money(sale.subtotal)}</span>
      </div>
      <div className="receipt-line">
        <span>{t("tax_label")} {sale.tax_applied ? `(${sale.tax_percentage}%)` : `(${t("excluded")})`}</span>
        <span>{money(sale.tax_total)}</span>
      </div>
      <div className="receipt-line grand">
        <span>{t("total_label")}</span>
        <span>{money(sale.grand_total)}</span>
      </div>
      <p>{t("thank_you")}</p>
    </section>
  );
}
