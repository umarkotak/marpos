import { t, useI18n } from "@/lib/i18n";
import { X } from "lucide-react";
import { BuyerFields } from "@/components/buyer-fields";
export function BuyerDialog({
  buyerOpen,
  setBuyerOpen,
  buyerDraft,
  setBuyerDraft,
  saveBuyer,
}) {
  useI18n();
  return (
    buyerOpen && (
      <div
        className="overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBuyerOpen(false);
        }}
      >
        <form
          className="modal buyer-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("buyer_details")}
          onSubmit={saveBuyer}
          onKeyDown={(event) => {
            if (event.key === "Escape") setBuyerOpen(false);
          }}
        >
          <div className="modal-head">
            <div>
              <small>{t("current_order")}</small>
              <h2>{t("buyer_details")}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t("close")}
              onClick={() => setBuyerOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            <BuyerFields buyer={buyerDraft} onChange={setBuyerDraft} />
          </div>
          <div className="modal-foot">
            <button
              type="button"
              className="button secondary"
              onClick={() => setBuyerOpen(false)}
            >
              {t("cancel")}
            </button>
            <button className="button primary">{t("save_buyer")}</button>
          </div>
        </form>
      </div>
    )
  );
}
