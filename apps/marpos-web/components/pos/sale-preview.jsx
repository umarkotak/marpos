import { t, useI18n } from "@/lib/i18n";
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
  useI18n();
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
          aria-label={t("review_sale")}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !checkingOut) setPreviewOpen(false);
          }}
        >
          <div className="modal-head">
            <div>
              <small>{t("final_check")}</small>
              <h2>{t("review_sale")}</h2>
              <p>{t("check_the_order_before_you_complete_the_sale")}</p>
            </div>
            <button
              className="icon-button"
              aria-label={t("close")}
              autoFocus
              disabled={checkingOut}
              onClick={() => setPreviewOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            <div className="sale-preview-buyer">
              <strong>{t("buyer")}</strong>
              <span>
                {[buyer.buyer_name, buyer.buyer_phone, buyer.buyer_email]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <h3>
              {t("items")}
              {cart.length})
            </h3>
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
                        ? t("addon_unit_price", {
                            price: money(addon.price_delta),
                          })
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
              <span>{t("subtotal")}</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>
                {t("tax_label")}{" "}
                {taxOn ? `(${auth.tax_percentage}%)` : "(excluded)"}
              </span>
              <strong>{money(tax)}</strong>
            </div>
            <div className="sale-preview-total">
              <span>{t("total_label")}</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="modal-foot">
              <button
                className="button secondary"
                disabled={checkingOut}
                onClick={() => setPreviewOpen(false)}
              >
                {t("back_to_order")}
              </button>
              <button
                className="button primary"
                disabled={checkingOut}
                onClick={checkout}
              >
                {checkingOut ? t("saving_sale") : t("complete_cash_sale")}
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  );
}
