export function priceItem(item) {
  const gross = item.quantity * (
    item.unit_price + item.addons.reduce((sum, addon) => sum + addon.price_delta, 0)
  );
  const discount = item.discount_per_unit > 0
    ? item.discount_per_unit * item.quantity
    : item.discount_total || 0;
  return { ...item, discount_total: discount, line_total: gross - discount };
}
