import { t, formatLocale } from "@/lib/i18n";
import { money } from "@/lib/reports";

export function receiptText({ sale, items }, auth, paperWidth) {
  // shortcut: use 32/48 text columns; calibrate for printers with different fonts.
  const columns = paperWidth === 80 ? 48 : 32;
  const lines = [];
  function line(value) {
    // Remove printer control characters from names and other entered text.
    const text = String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
    const chars = Array.from(text);
    for (let offset = 0; offset < chars.length; offset += columns)
      lines.push(chars.slice(offset, offset + columns).join(""));
  }
  function amount(label, value) {
    line(label);
    const formatted = money(value);
    line(formatted.padStart(columns, " "));
  }
  const divider = () => lines.push("-".repeat(columns));
  line(auth.store_name);
  if (auth.address) line(auth.address);
  line(sale.reference || t("temporary_receipt_number", { number: sale.receipt_number }));
  line(`${new Date(sale.completed_at).toLocaleString(formatLocale(), { timeZone: "Asia/Jakarta" })} WIB`);
  if (sale.cashier_name) line(`${t("cashier")}: ${sale.cashier_name}`);
  for (const key of ["buyer_name", "buyer_phone", "buyer_email"])
    if (sale[key]) line(`${t(key)}: ${sale[key]}`);
  if (sale.payment_method_note)
    line(`${t("payment_method_receipt")}: ${t(`payment_method_${sale.payment_method_note}`)}`);
  if (sale.revision > 0) line(`${t("corrected_order_revision")} ${sale.revision}`);
  divider();
  for (const item of items) {
    amount(`${item.quantity} x ${item.product_name}`, item.line_total);
    line(`${item.quantity} x ${money(item.unit_price)}`);
    if (item.discount_total > 0) {
      line(`${t("discount")}: -${money(item.discount_total)}`);
      if (item.discount_per_unit > 0)
        line(`(${money(item.discount_per_unit)} ${t("per_unit")})`);
    }
    if (item.product_description) line(item.product_description);
    for (const addon of item.addons || [])
      line(`+ ${addon.option_name} ${money(addon.price_delta)}`);
    lines.push("");
  }
  divider();
  amount(t("subtotal"), sale.subtotal);
  amount(`${t("tax_label")} ${sale.tax_applied ? `(${sale.tax_percentage}%)` : `(${t("excluded")})`}`, sale.tax_total);
  amount(t("total_label"), sale.grand_total);
  line(t("thank_you"));
  return lines.join("\n") + "\n\n\n";
}

export function rawBTIntent(text) {
  const installURL = "https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter";
  return `intent:${encodeURIComponent(text)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=${encodeURIComponent(installURL)};end;`;
}
