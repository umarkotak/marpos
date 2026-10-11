import { t, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { X } from "lucide-react";
import { IdrInput } from "@/components/idr-input";
import { money } from "@/lib/reports";

export function AdHocProductDialog({ products, onClose, onAdd, onSelect, busy }) {
  useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const selected = products.find((product) => product.id === selectedId);
  const query = name.trim().toLowerCase();
  const suggestions = query && !selectedId
    ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query)).slice(0, 8)
    : [];
  return (
    <div className="overlay" onMouseDown={(event) => {
      if (!busy && event.target === event.currentTarget) onClose();
    }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={t("add_ad_hoc_product")}
        onKeyDown={(event) => { if (!busy && event.key === "Escape") onClose(); }}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (selectedId) {
            if (selected) onSelect(selected);
            return;
          }
          onAdd({ name: name.trim(), description: description.trim(), price: Number(price) });
        }}>
        <div className="modal-head">
          <h2>{t("add_ad_hoc_product")}</h2>
          <button type="button" className="icon-button" aria-label={t("close")} disabled={busy} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <fieldset className="ad-hoc-fields" disabled={busy}>
            <label>{t("product_name")}<input required maxLength={200} autoFocus value={name} onChange={(event) => {
              setName(event.target.value);
              setSelectedId(null);
            }} /></label>
            {suggestions.length > 0 && <div className="ad-hoc-suggestions" role="group" aria-label={t("product_suggestions")}>
              <small>{t("product_suggestions")}</small>
              {suggestions.map((product) => <button type="button" key={product.id} onClick={() => {
                setSelectedId(product.id);
                setName(product.name);
                setDescription(product.description || "");
                setPrice(String(product.price));
              }}>
                <span><strong>{product.name}</strong><small>{product.sku}</small></span>
                <span>{money(product.price)}</span>
              </button>)}
            </div>}
            {selectedId && <small>{t("reuse_existing_product")}</small>}
            <label>{t("description_optional")}<textarea maxLength={2000} readOnly={Boolean(selectedId)} value={selected ? selected.description || "" : description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label>{t("price_idr")}<IdrInput required readOnly={Boolean(selectedId)} value={selected ? selected.price : price} onValueChange={setPrice} /></label>
          </fieldset>
        </div>
        <div className="modal-foot"><button className="button primary" disabled={busy || Boolean(selectedId && !selected)}>{busy ? t("saving") : t("add_to_order")}</button></div>
      </form>
    </div>
  );
}
