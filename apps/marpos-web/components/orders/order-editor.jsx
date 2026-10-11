import { t, message, translateMessage, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { BuyerFields, buyerError, blankBuyer } from "@/components/buyer-fields";
import { money } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";
import { priceItem } from "@/lib/sale-items";
export function OrderEditor({ detail, products, onSave, onCancel }) {
  useI18n();
  const [buyer, setBuyer] = useState({
    ...blankBuyer(),
    ...Object.fromEntries(
      ["buyer_name", "buyer_phone", "buyer_email"].map((key) => [
        key,
        detail.sale[key] || "",
      ]),
    ),
  });
  const [items, setItems] = useState(
    detail.items.map((item) => ({
      ...item,
      addons: item.addons || [],
      cost_breakdown: item.cost_breakdown || [],
    })),
  );
  const [taxOn, setTaxOn] = useState(detail.sale.tax_applied),
    [tax, setTax] = useState(detail.sale.tax_percentage),
    [reason, setReason] = useState("");
  const [productID, setProductID] = useState(""),
    [choices, setChoices] = useState({}),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const product = products.find((row) => row.id === productID);
  const lines = items.map((item) => priceItem({
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    discount_total: Number(item.discount_total || 0),
    discount_per_unit: Number(item.discount_per_unit || 0),
    addons: item.addons.map((addon) => ({
      ...addon,
      price_delta: Number(addon.price_delta),
    })),
  }));
  const subtotal = lines.reduce((sum, item) => sum + item.line_total, 0),
    taxTotal = taxOn ? Math.round((subtotal * Number(tax)) / 100) : 0,
    total = subtotal + taxTotal,
    delta = total - detail.sale.grand_total;
  function patch(id, values) {
    setItems((old) =>
      old.map((row) => (row.id === id ? { ...row, ...values } : row)),
    );
    setConfirmed(false);
  }
  function add() {
    if (!product) return;
    for (const group of product.addon_groups) {
      if (group.required && !choices[group.id]?.length) {
        setError(message("choose_group_option", { group: group.name }));
        return;
      }
    }
    const addons = product.addon_groups.flatMap((group) =>
      (choices[group.id] || []).map((id) => {
        const option = group.options.find((row) => row.id === id);
        return {
          id: crypto.randomUUID(),
          option_id: id,
          group_name: group.name,
          option_name: option.name,
          price_delta: option.price_delta,
          cost_delta: option.cost_delta || 0,
        };
      }),
    );
    const costs = [
      ...(product.cost_breakdown || []),
      ...addons
        .filter((row) => row.cost_delta > 0)
        .map((row) => ({
          name: `${row.group_name}: ${row.option_name}`,
          amount: row.cost_delta,
        })),
    ];
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        product_description: product.description || "",
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        addons,
        cost_configured: product.cost_configured,
        unit_cost: product.cost_configured
          ? costs.reduce((sum, row) => sum + row.amount, 0)
          : 0,
        cost_breakdown: product.cost_configured ? costs : [],
      },
    ]);
    setProductID("");
    setChoices({});
    setError("");
    setConfirmed(false);
  }
  async function submit(event) {
    event.preventDefault();
    const buyerMessage = buyerError(buyer);
    if (buyerMessage) {
      setError(buyerMessage);
      return;
    }
    if (
      !lines.length ||
      lines.some(
        (row) =>
          !Number.isSafeInteger(row.quantity) ||
          row.quantity < 1 ||
          row.quantity > 1000 ||
          !Number.isSafeInteger(row.unit_price) ||
          row.unit_price < 0 ||
          !Number.isSafeInteger(row.discount_total) || row.discount_total < 0 ||
          !Number.isSafeInteger(row.discount_per_unit) || row.discount_per_unit < 0 ||
          row.line_total < 0 ||
          row.addons.some(
            (addon) =>
              !Number.isSafeInteger(addon.price_delta) || addon.price_delta < 0,
          ),
      )
    ) {
      setError(message("check_item_quantities_and_prices"));
      return;
    }
    if (delta && !confirmed) {
      setError(message("confirm_the_cash_received_or_returned"));
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...buyer,
        items: lines,
        tax_applied: taxOn,
        tax_percentage: Number(tax),
        subtotal,
        discount_total: lines.reduce((sum, item) => sum + item.discount_total, 0),
        tax_total: taxTotal,
        grand_total: total,
        revision: detail.sale.revision || 0,
        reason,
        cash_adjustment_confirmed: confirmed,
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="order-edit-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>{t("edit_order")}</legend>
        <p>
          {t(
            "changes_keep_the_original_receipt_reference_and_create_a_correction_record",
          )}
        </p>
        <BuyerFields buyer={buyer} onChange={setBuyer} />
        {items.map((item) => (
          <div className="order-edit-item" key={item.id}>
            <strong>{item.product_name}</strong>
            <div className="form-grid">
              <label>
                {t("quantity")}
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={item.quantity}
                  onChange={(e) => patch(item.id, { quantity: e.target.value })}
                />
              </label>
              <label>
                {t("unit_price_idr")}
                <IdrInput
                  required
                  value={item.unit_price}
                  onValueChange={(unit_price) => patch(item.id, { unit_price })}
                />
              </label>
            </div>
            <label>
              {t(item.discount_per_unit > 0 ? "discount_per_unit_idr" : "discount_idr")}
              <IdrInput
                value={item.discount_per_unit || item.discount_total || 0}
                onValueChange={(value) => patch(item.id, item.discount_per_unit > 0
                  ? { discount_per_unit: value, discount_total: 0 }
                  : { discount_total: value, discount_per_unit: 0 })}
              />
            </label>
            {item.addons.map((addon, index) => (
              <label key={addon.id || index}>
                {addon.group_name}: {addon.option_name} {t("price_idr")}
                <IdrInput
                  required
                  value={addon.price_delta}
                  onValueChange={(price_delta) =>
                    patch(item.id, {
                      addons: item.addons.map((row, i) =>
                        i === index ? { ...row, price_delta } : row,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setItems(items.filter((row) => row.id !== item.id));
                setConfirmed(false);
              }}
            >
              {t("remove_item")}
            </button>
          </div>
        ))}
        <div className="order-add-product">
          <label>
            {t("add_product")}
            <select
              value={productID}
              onChange={(e) => {
                setProductID(e.target.value);
                setChoices({});
              }}
            >
              <option value="">{t("choose_a_product")}</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {money(row.price)}
                </option>
              ))}
            </select>
          </label>
          {product?.addon_groups.map((group) => (
            <fieldset key={group.id}>
              <legend>
                {group.name}
                {group.required ? t("required_suffix") : ""}
              </legend>
              {group.options.map((option) => (
                <label className="tax-switch" key={option.id}>
                  <span>
                    {option.name} · +{money(option.price_delta)}
                  </span>
                  <input
                    type={
                      group.selection_mode === "single" ? "radio" : "checkbox"
                    }
                    name={group.id}
                    checked={(choices[group.id] || []).includes(option.id)}
                    onChange={(e) =>
                      setChoices({
                        ...choices,
                        [group.id]:
                          group.selection_mode === "single"
                            ? [option.id]
                            : e.target.checked
                              ? [...(choices[group.id] || []), option.id]
                              : (choices[group.id] || []).filter(
                                  (id) => id !== option.id,
                                ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className="button secondary"
            type="button"
            disabled={!product}
            onClick={add}
          >
            {t("add_item")}
          </button>
        </div>
        <label className="tax-switch">
          <span>{t("include_tax")}</span>
          <input
            type="checkbox"
            checked={taxOn}
            onChange={(e) => {
              setTaxOn(e.target.checked);
              setConfirmed(false);
            }}
          />
        </label>
        <label>
          {t("tax_percentage")}
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={tax}
            onChange={(e) => {
              setTax(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <div className="receipt-line grand">
          <span>{t("corrected_total")}</span>
          <strong>{money(total)}</strong>
        </div>
        {delta !== 0 && (
          <label className="cash-adjustment">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {t(
                delta > 0
                  ? "cash_confirmation_received"
                  : "cash_confirmation_returned",
                { amount: money(Math.abs(delta)) },
              )}
            </span>
          </label>
        )}
        <label>
          {t("correction_reason")}
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="message" role="alert">
            {translateMessage(error)}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button className="button primary" disabled={!lines.length}>
            {busy ? t("saving") : t("save_correction")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
