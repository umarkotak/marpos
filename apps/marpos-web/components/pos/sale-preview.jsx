import { X } from "lucide-react";
import { money } from "@/lib/reports";
import { useRegister } from "@/components/register-provider";
export function SalePreview({
  previewOpen,
  setPreviewOpen,
  subtotal,
  tax,
  total,
  checkout,
}) {
  const { auth, draftOrders, checkingOut } = useRegister();
  const { cart, buyer, taxOn } = draftOrders;
  return (
    previewOpen && (
      <div
        className="overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !checkingOut)
            setPreviewOpen(false);
        }}
      >
        <section
          className="modal sale-preview"
          role="dialog"
          aria-modal="true"
          aria-label="Review sale"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !checkingOut) setPreviewOpen(false);
          }}
        >
          <div className="modal-head">
            <div>
              <small>FINAL CHECK</small>
              <h2>Review sale</h2>
              <p>Check the order before you complete the sale.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Close"
              autoFocus
              disabled={checkingOut}
              onClick={() => setPreviewOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            <div className="sale-preview-buyer">
              <strong>Buyer</strong>
              <span>
                {[buyer.buyer_name, buyer.buyer_phone, buyer.buyer_email]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <h3>Items ({cart.length})</h3>
            {cart.map((item) => (
              <div className="sale-preview-item" key={item.id}>
                <div>
                  <strong>{item.product_name}</strong>
                  <small>
                    {item.quantity} × {money(item.unit_price)}
                  </small>
                  {item.addons.map((addon) => (
                    <small key={addon.id}>
                      + {addon.option_name}
                      {addon.price_delta
                        ? ` · ${money(addon.price_delta)} each`
                        : " · Free"}
                    </small>
                  ))}
                </div>
                <strong>{money(item.line_total)}</strong>
              </div>
            ))}
          </div>
          <div className="sale-preview-footer">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>
                Tax {taxOn ? `(${auth.tax_percentage}%)` : "(excluded)"}
              </span>
              <strong>{money(tax)}</strong>
            </div>
            <div className="sale-preview-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="modal-foot">
              <button
                className="button secondary"
                disabled={checkingOut}
                onClick={() => setPreviewOpen(false)}
              >
                Back to order
              </button>
              <button
                className="button primary"
                disabled={checkingOut}
                onClick={checkout}
              >
                {checkingOut ? "Saving sale…" : "Complete cash sale"}
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  );
}
