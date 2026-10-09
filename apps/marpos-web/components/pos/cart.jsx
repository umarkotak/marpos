import { t, useI18n } from "@/lib/i18n";
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
  useI18n();
  const { db, auth, draftOrders, checkingOut, lastReceipt, printReceipt } =
    useRegister();
  const { cart, setCart, buyer, taxOn, setTaxOn } = draftOrders;
  return (
    <aside className="cart" aria-label={t("current_order_label")}>
      <div className="cart-head">
        <div className="cart-head-row">
          <div>
            <h2>
              {t("orders_label")} <span>{draftOrders.drafts.length}</span>
            </h2>
            <small>
              {t("item_count", { count: cart.length })} ·{" "}
              {draftOrders.saving ? t("saving") : t("saved_on_this_device")}
            </small>
          </div>
          <div className="cart-actions">
            {lastReceipt && (
              <button
                className="icon-button"
                title={t("print_last_receipt")}
                aria-label={t("print_last_receipt")}
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
              <Plus size={15} /> {t("new_order")}
            </button>
          </div>
        </div>
        <div className="draft-list" aria-label={t("open_orders")}>
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
                    t("order_number", { number: index + 1 })}
                </strong>
                <small>{t("item_count", { count: row.items.length })}</small>
              </button>
              <button
                className="draft-discard"
                aria-label={t("discard_order", {
                  order:
                    row.buyer.buyer_name ||
                    t("draft_order_number", { number: index + 1 }),
                })}
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
          <small>{t("buyer_details_label")}</small>
          <strong>
            {buyer.buyer_name ||
              buyer.buyer_phone ||
              buyer.buyer_email ||
              t("add_buyer_details")}
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
      <div className="cart-items" aria-label={t("order_items")}>
        {cart.length === 0 ? (
          <div className="empty">
            <ShoppingCart size={30} />
            <strong>{t("no_items_yet")}</strong>
            <p>{t("choose_a_product_to_add_it_here")}</p>
          </div>
        ) : (
          cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <div className="item-head">
                <strong>{item.product_name}</strong>
                <button
                  className="icon-button danger"
                  aria-label={t("remove_product", {
                    product: item.product_name,
                  })}
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
                    aria-label={t("decrease_quantity", {
                      product: item.product_name,
                    })}
                  >
                    <Minus size={14} />
                  </button>
                  {item.quantity}
                  <button
                    disabled={checkingOut || item.quantity >= 1000}
                    onClick={() => changeQuantity(item.id, 1)}
                    aria-label={t("increase_quantity", {
                      product: item.product_name,
                    })}
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
          <span>{t("subtotal")}</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <label className="tax-switch">
          <span>
            {t("include_tax_label")}
            {auth.tax_percentage}%)
          </span>
          <input
            type="checkbox"
            checked={taxOn}
            disabled={checkingOut}
            onChange={(e) => setTaxOn(e.target.checked)}
          />
        </label>
        <div>
          <span>{t("tax_label")}</span>
          <strong>{money(tax)}</strong>
        </div>
        <div className="total">
          <span>{t("total_label")}</span>
          <strong>{money(total)}</strong>
        </div>
        <button
          className="button primary checkout"
          disabled={!cart.length || !db || !draftOrders.ready || checkingOut}
          onClick={openCheckoutPreview}
        >
          {t("review_sale")} <span>{money(total)}</span>
        </button>
      </div>
    </aside>
  );
}
