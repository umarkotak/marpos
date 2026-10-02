import { X } from "lucide-react";
import { money } from "@/lib/reports";
export function AddonDialog({
  selected,
  setSelected,
  choices,
  setChoices,
  confirmChoices,
}) {
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
          aria-label={`Choose add-ons for ${selected.name}`}
        >
          <div className="modal-head">
            <div>
              <small>ADD-ONS</small>
              <h2>{selected.name}</h2>
              <p>Base price {money(selected.price)}</p>
            </div>
            <button
              className="icon-button"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            {selected.addon_groups.map((group) => (
              <div className="choice-group" key={group.id}>
                <strong>{group.name}</strong>
                <small>
                  {group.required ? "Required" : "Optional"} ·{" "}
                  {group.selection_mode === "single"
                    ? "Choose one"
                    : "Choose several"}
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
                        : "Free"}
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
              Cancel
            </button>
            <button className="button primary" onClick={confirmChoices}>
              Add to sale
            </button>
          </div>
        </section>
      </div>
    )
  );
}
