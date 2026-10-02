import { X } from "lucide-react";
import { BuyerFields } from "@/components/buyer-fields";
export function BuyerDialog({
  buyerOpen,
  setBuyerOpen,
  buyerDraft,
  setBuyerDraft,
  saveBuyer,
}) {
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
          aria-label="Buyer details"
          onSubmit={saveBuyer}
          onKeyDown={(event) => {
            if (event.key === "Escape") setBuyerOpen(false);
          }}
        >
          <div className="modal-head">
            <div>
              <small>CURRENT ORDER</small>
              <h2>Buyer details</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
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
              Cancel
            </button>
            <button className="button primary">Save buyer</button>
          </div>
        </form>
      </div>
    )
  );
}
