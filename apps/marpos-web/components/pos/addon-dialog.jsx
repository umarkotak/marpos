import { t, useI18n } from "@/lib/i18n";
import { X } from "lucide-react";
import { money } from "@/lib/reports";
export function AddonDialog({
  selected,
  setSelected,
  choices,
  setChoices,
  confirmChoices,
}) {
  useI18n();
  return (
    selected && (
      <div
        className="overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        <section
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("choose_product_addons", { product: selected.name })}
        >
          <div className="modal-head">
            <div>
              <small>{t("add_ons")}</small>
              <h2>{selected.name}</h2>
              <p>
                {t("base_price")} {money(selected.price)}
              </p>
            </div>
            <button
              className="icon-button"
              onClick={() => setSelected(null)}
              aria-label={t("close")}
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            {selected.addon_groups.map((group) => (
              <div className="choice-group" key={group.id}>
                <strong>{group.name}</strong>
                <small>
                  {group.required ? t("required") : t("optional")} ·{" "}
                  {group.selection_mode === "single"
                    ? t("choose_one")
                    : t("choose_several")}
                </small>
                {group.options.map((option) => (
                  <label className="choice-option" key={option.id}>
                    <input
                      type={
                        group.selection_mode === "single" ? "radio" : "checkbox"
                      }
                      name={group.id}
                      checked={(choices[group.id] || []).includes(option.id)}
                      onChange={() =>
                        setChoices((old) => ({
                          ...old,
                          [group.id]:
                            group.selection_mode === "single"
                              ? [option.id]
                              : (old[group.id] || []).includes(option.id)
                                ? old[group.id].filter((id) => id !== option.id)
                                : [...(old[group.id] || []), option.id],
                        }))
                      }
                    />
                    <span>{option.name}</span>
                    <strong>
                      {option.price_delta
                        ? `+ ${money(option.price_delta)}`
                        : t("free")}
                    </strong>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="modal-foot">
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              {t("cancel")}
            </button>
            <button className="button primary" onClick={confirmChoices}>
              {t("add_to_sale")}
            </button>
          </div>
        </section>
      </div>
    )
  );
}
