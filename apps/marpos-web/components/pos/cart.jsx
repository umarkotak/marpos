import { Minus, Pencil, Plus, Printer, ShoppingCart, X } from "lucide-react";
import { money } from "@/lib/reports";
import { useRegister } from "@/components/register-provider";
export function Cart({
  subtotal,
  tax,
  total,
  changeQuantity,
  openBuyer,
  openCheckoutPreview,
  setBuyerOpen,
  setMobilePanel,
}) {
  const { db, auth, draftOrders, checkingOut, lastReceipt, printReceipt } =
    useRegister();
  const { cart, setCart, buyer, taxOn, setTaxOn } = draftOrders;
  return (
    <aside className="cart" aria-label="Current order">
      <div className="cart-head">
        <div className="cart-head-row">
          <div>
            <h2>
              Orders <span>{draftOrders.drafts.length}</span>
            </h2>
            <small>
              {cart.length} {cart.length === 1 ? "item" : "items"} ·{" "}
              {draftOrders.saving ? "Saving…" : "Saved on this device"}
            </small>
          </div>
          <div className="cart-actions">
            {lastReceipt && (
              <button
                className="icon-button"
                title="Print last receipt"
                aria-label="Print last receipt"
                onClick={() => printReceipt(lastReceipt)}
              >
                <Printer size={19} />
              </button>
            )}
            <button
              className="button secondary"
              disabled={!draftOrders.ready || checkingOut}
              onClick={() => {
                draftOrders.start();
                setBuyerOpen(false);
                setMobilePanel("catalog");
              }}
            >
              <Plus size={15} /> New order
            </button>
          </div>
        </div>
        <div className="draft-list" aria-label="Open orders">
          {draftOrders.drafts.map((row, index) => (
            <div
              key={row.id}
              className={row.id === draftOrders.activeID ? "active" : ""}
            >
              <button
                className="draft-select"
                aria-current={
                  row.id === draftOrders.activeID ? "true" : undefined
                }
                disabled={checkingOut}
                onClick={() => {
                  draftOrders.resume(row.id);
                  setBuyerOpen(false);
                }}
              >
                <strong>
                  {row.buyer.buyer_name ||
                    row.buyer.buyer_phone ||
                    row.buyer.buyer_email ||
                    `Order ${index + 1}`}
                </strong>
                <small>
                  {row.items.length} {row.items.length === 1 ? "item" : "items"}
                </small>
              </button>
              <button
                className="draft-discard"
                aria-label={`Discard ${row.buyer.buyer_name || `order ${index + 1}`}`}
                disabled={checkingOut}
                onClick={() => draftOrders.discard(row.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <button
        className="buyer-summary"
        disabled={!draftOrders.ready || checkingOut}
        onClick={openBuyer}
      >
        <span>
          <small>BUYER DETAILS</small>
          <strong>
            {buyer.buyer_name ||
              buyer.buyer_phone ||
              buyer.buyer_email ||
              "Add buyer details"}
          </strong>
          {(buyer.buyer_phone || buyer.buyer_email) && buyer.buyer_name && (
            <small>
              {[buyer.buyer_phone, buyer.buyer_email]
                .filter(Boolean)
                .join(" · ")}
            </small>
          )}
        </span>
        <Pencil size={17} />
      </button>
      <div className="cart-items" aria-label="Order items">
        {cart.length === 0 ? (
          <div className="empty">
            <ShoppingCart size={30} />
            <strong>No items yet</strong>
            <p>Choose a product to add it here.</p>
          </div>
        ) : (
          cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <div className="item-head">
                <strong>{item.product_name}</strong>
                <button
                  className="icon-button danger"
                  aria-label={`Remove ${item.product_name}`}
                  disabled={checkingOut}
                  onClick={() =>
                    setCart((old) =>
                      old.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
              {item.addons.map((addon) => (
                <small key={addon.id}>
                  + {addon.option_name}
                  {addon.price_delta ? ` (${money(addon.price_delta)})` : ""}
                </small>
              ))}
              <div className="item-foot">
                <div className="quantity">
                  <button
                    disabled={checkingOut || item.quantity <= 1}
                    onClick={() => changeQuantity(item.id, -1)}
                    aria-label={`Decrease ${item.product_name} quantity`}
                  >
                    <Minus size={14} />
                  </button>
                  {item.quantity}
                  <button
                    disabled={checkingOut || item.quantity >= 1000}
                    onClick={() => changeQuantity(item.id, 1)}
                    aria-label={`Increase ${item.product_name} quantity`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <strong>{money(item.line_total)}</strong>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="totals">
        <div>
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <label className="tax-switch">
          <span>Include tax ({auth.tax_percentage}%)</span>
          <input
            type="checkbox"
            checked={taxOn}
            disabled={checkingOut}
            onChange={(e) => setTaxOn(e.target.checked)}
          />
        </label>
        <div>
          <span>Tax</span>
          <strong>{money(tax)}</strong>
        </div>
        <div className="total">
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>
        <button
          className="button primary checkout"
          disabled={!cart.length || !db || !draftOrders.ready || checkingOut}
          onClick={openCheckoutPreview}
        >
          Review sale <span>{money(total)}</span>
        </button>
      </div>
    </aside>
  );
}
