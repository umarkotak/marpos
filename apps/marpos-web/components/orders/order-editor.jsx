import { useState } from "react";
import { BuyerFields, buyerError, blankBuyer } from "@/components/buyer-fields";
import { money } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";
export function OrderEditor({ detail, products, onSave, onCancel }) {
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
  const lines = items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    addons: item.addons.map((addon) => ({
      ...addon,
      price_delta: Number(addon.price_delta),
    })),
    line_total:
      Number(item.quantity) *
      (Number(item.unit_price) +
        item.addons.reduce((sum, addon) => sum + Number(addon.price_delta), 0)),
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
        setError(`Choose an option for ${group.name}.`);
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
    const message = buyerError(buyer);
    if (message) {
      setError(message);
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
          row.addons.some(
            (addon) =>
              !Number.isSafeInteger(addon.price_delta) || addon.price_delta < 0,
          ),
      )
    ) {
      setError("Check item quantities and prices.");
      return;
    }
    if (delta && !confirmed) {
      setError("Confirm the cash received or returned.");
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
        <legend>Edit order</legend>
        <p>
          Changes keep the original receipt reference and create a correction
          record.
        </p>
        <BuyerFields buyer={buyer} onChange={setBuyer} />
        {items.map((item) => (
          <div className="order-edit-item" key={item.id}>
            <strong>{item.product_name}</strong>
            <div className="form-grid">
              <label>
                Quantity
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
                Unit price (IDR)
                <IdrInput
                  required
                  value={item.unit_price}
                  onValueChange={(unit_price) => patch(item.id, { unit_price })}
                />
              </label>
            </div>
            {item.addons.map((addon, index) => (
              <label key={addon.id || index}>
                {addon.group_name}: {addon.option_name} price (IDR)
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
              Remove item
            </button>
          </div>
        ))}
        <div className="order-add-product">
          <label>
            Add product
            <select
              value={productID}
              onChange={(e) => {
                setProductID(e.target.value);
                setChoices({});
              }}
            >
              <option value="">Choose a product</option>
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
                {group.required ? " (required)" : ""}
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
            Add item
          </button>
        </div>
        <label className="tax-switch">
          <span>Include tax</span>
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
          Tax percentage
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
          <span>Corrected total</span>
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
              I confirm {money(Math.abs(delta))} cash was{" "}
              {delta > 0 ? "received from" : "returned to"} the buyer.
            </span>
          </label>
        )}
        <label>
          Correction reason
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="message" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" disabled={!lines.length}>
            {busy ? "Saving…" : "Save correction"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
