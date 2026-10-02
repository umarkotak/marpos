import { useEffect, useState } from "react";
import { ChevronDown, Package, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const newProduct = () => ({
  name: "",
  sku: "",
  category: "lainnya",
  price: "",
  cost_breakdown: [],
  addon_groups: [],
  image_urls: [],
});
const newGroup = () => ({
  name: "",
  selection_mode: "single",
  required: false,
  options: [{ name: "", price_delta: "0", cost_delta: "0" }],
});

export function ProductForm({
  product,
  storeID,
  categories,
  onSave,
  onNotice,
  busy,
  uploading,
  setUploading,
}) {
  const [form, setForm] = useState(
    product
      ? {
          ...product,
          category: product.category || "lainnya",
          cost_breakdown: product.cost_breakdown || [],
          image_urls: product.image_urls || [],
        }
      : newProduct(),
  );
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [customCategory, setCustomCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  useEffect(() => {
    setForm(
      product
        ? {
            ...product,
            category: product.category || "lainnya",
            cost_breakdown: product.cost_breakdown || [],
            image_urls: product.image_urls || [],
          }
        : newProduct(),
    );
    setCustomCategory("");
  }, [product]);
  useEffect(() => {
    let active = true;
    api(`/stores/${storeID}/products/categories`)
      .then((list) => {
        if (active)
          setCategoryOptions((old) => [...new Set([...list, ...old])]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [storeID]);
  function useCustomCategory() {
    const category = customCategory.trim().toLowerCase();
    if (
      !category ||
      [...category].length > 100 ||
      !/^[\p{L}\p{N} ]+$/u.test(category)
    ) {
      onNotice("Use 1 to 100 letters, numbers, or spaces for the category.");
      return;
    }
    setCategoryOptions((old) => [...new Set([...old, category])]);
    setForm((old) => ({ ...old, category }));
    setCustomCategory("");
    setCategoryOpen(false);
  }
  async function addImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (form.image_urls.length + files.length > 10) {
      onNotice("Use at most 10 images per product.");
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024) {
          onNotice("Choose an image smaller than 8 MB.");
          continue;
        }
        const body = new FormData();
        body.append("image", file);
        try {
          const result = await api(`/stores/${storeID}/images`, {
            method: "POST",
            body,
            headers: {},
            signal: AbortSignal.timeout(45000),
          });
          setForm((old) => ({
            ...old,
            image_urls: [...old.image_urls, result.url],
          }));
        } catch (error) {
          onNotice(error.message);
        }
      }
    } finally {
      setUploading(false);
    }
  }
  function groupChange(index, change) {
    setForm((old) => ({
      ...old,
      addon_groups: old.addon_groups.map((group, i) =>
        i === index ? { ...group, ...change } : group,
      ),
    }));
  }
  function optionChange(groupIndex, optionIndex, change) {
    setForm((old) => ({
      ...old,
      addon_groups: old.addon_groups.map((group, i) =>
        i !== groupIndex
          ? group
          : {
              ...group,
              options: group.options.map((option, j) =>
                j === optionIndex ? { ...option, ...change } : option,
              ),
            },
      ),
    }));
  }
  function submit(event) {
    event.preventDefault();
    onSave({
      ...form,
      price: Number(form.price),
      cost_breakdown: form.cost_breakdown.map((cost) => ({
        ...cost,
        amount: Number(cost.amount),
      })),
      addon_groups: form.addon_groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          price_delta: Number(option.price_delta),
          cost_delta: Number(option.cost_delta || 0),
        })),
      })),
    });
  }
  return (
    <form onSubmit={submit} className="settings-card product-form">
      <header className="settings-profile">
        <span className="settings-avatar" aria-hidden="true">
          <Package size={25} />
        </span>
        <div>
          <small>
            {product?.id ? "CATALOG / EDIT PRODUCT" : "CATALOG / NEW PRODUCT"}
          </small>
          <h2>
            {product?.id ? form.name || "Edit product" : "Create a product"}
          </h2>
          <p>Set the details customers and cashiers see at checkout.</p>
        </div>
      </header>
      <section
        className="settings-section"
        aria-labelledby="product-details-heading"
      >
        <div className="settings-section-copy">
          <span>01 / DETAILS</span>
          <h3 id="product-details-heading">Product details</h3>
          <p>Add a clear name, SKU, category, and price.</p>
        </div>
        <div className="settings-fields product-fields">
          <label>
            Product name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Iced coffee"
            />
          </label>
          <label>
            SKU
            <input
              required
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="COFFEE-01"
            />
          </label>
          <div className="category-picker">
            <span>Category</span>
            <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="category-trigger"
                    aria-label={`Category: ${form.category}`}
                  />
                }
              >
                {form.category}
                <ChevronDown size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="category-menu">
                <div className="category-options">
                  {[
                    ...new Set(
                      [...categoryOptions, form.category].filter(Boolean),
                    ),
                  ].map((category) => (
                    <DropdownMenuItem
                      key={category}
                      onClick={() => setForm((old) => ({ ...old, category }))}
                    >
                      {category}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <div className="category-add">
                  <input
                    aria-label="New category"
                    maxLength={100}
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        useCustomCategory();
                      }
                    }}
                    placeholder="New category"
                  />
                  <button
                    type="button"
                    className="button secondary"
                    aria-label="Use new category"
                    disabled={!customCategory.trim()}
                    onClick={useCustomCategory}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <label>
            Price (IDR)
            <IdrInput
              required
              value={form.price}
              onValueChange={(price) => setForm({ ...form, price })}
            />
          </label>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="product-images-heading"
      >
        <div className="settings-section-copy">
          <span>02 / IMAGES</span>
          <h3 id="product-images-heading">Product images</h3>
          <p>Add up to 10 images. The first image appears in the catalog.</p>
        </div>
        <div className="product-section-content">
          <label className="button secondary image-upload">
            {uploading ? "Uploading…" : "Add images"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              multiple
              disabled={uploading || busy || form.image_urls.length >= 10}
              onChange={addImages}
            />
          </label>
          {!!form.image_urls.length && (
            <div className="product-images">
              {form.image_urls.map((url, index) => (
                <div key={url}>
                  <img
                    src={url}
                    alt={`${form.name || "Product"} image ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() =>
                      setForm((old) => ({
                        ...old,
                        image_urls: old.image_urls.filter(
                          (item) => item !== url,
                        ),
                      }))
                    }
                  >
                    <X size={16} />
                  </button>
                  {index === 0 && <small>Catalog image</small>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="product-cost-heading"
      >
        <div className="settings-section-copy">
          <span>03 / COSTS</span>
          <h3 id="product-cost-heading">Production cost</h3>
          <p>List materials, packaging, and other costs for one unit.</p>
        </div>
        <div className="product-section-content">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setForm({
                ...form,
                cost_breakdown: [
                  ...form.cost_breakdown,
                  { name: "", amount: "0" },
                ],
              })
            }
          >
            <Plus size={16} /> Add cost
          </button>
          {form.cost_breakdown.map((cost, i) => (
            <div className="option-fields" key={i}>
              <label>
                Cost item
                <input
                  required
                  maxLength={100}
                  value={cost.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cost_breakdown: form.cost_breakdown.map((row, j) =>
                        j === i ? { ...row, name: e.target.value } : row,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Cost (IDR)
                <IdrInput
                  required
                  value={cost.amount}
                  onValueChange={(amount) =>
                    setForm({
                      ...form,
                      cost_breakdown: form.cost_breakdown.map((row, j) =>
                        j === i ? { ...row, amount } : row,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button danger"
                aria-label="Remove cost"
                onClick={() =>
                  setForm({
                    ...form,
                    cost_breakdown: form.cost_breakdown.filter(
                      (_, j) => j !== i,
                    ),
                  })
                }
              >
                <X size={17} />
              </button>
            </div>
          ))}
          <p className="product-cost-total">
            Total unit cost{" "}
            <strong>
              {money(
                form.cost_breakdown.reduce(
                  (sum, cost) => sum + Number(cost.amount),
                  0,
                ),
              )}
            </strong>
          </p>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="product-addons-heading"
      >
        <div className="settings-section-copy">
          <span>04 / ADD-ONS</span>
          <h3 id="product-addons-heading">Add-on groups</h3>
          <p>Offer one choice or several choices with the product.</p>
        </div>
        <div className="product-section-content">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setForm({
                ...form,
                addon_groups: [...form.addon_groups, newGroup()],
              })
            }
          >
            <Plus size={16} /> Add group
          </button>
          {form.addon_groups.map((group, i) => (
            <div className="addon-editor" key={i}>
              <div className="group-fields">
                <label>
                  Group name
                  <input
                    required
                    value={group.name}
                    onChange={(e) => groupChange(i, { name: e.target.value })}
                    placeholder="Milk"
                  />
                </label>
                <label>
                  Choice type
                  <select
                    value={group.selection_mode}
                    onChange={(e) =>
                      groupChange(i, { selection_mode: e.target.value })
                    }
                  >
                    <option value="single">Choose one</option>
                    <option value="multiple">Choose several</option>
                  </select>
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) =>
                      groupChange(i, { required: e.target.checked })
                    }
                  />{" "}
                  Required
                </label>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Remove group"
                  onClick={() =>
                    setForm({
                      ...form,
                      addon_groups: form.addon_groups.filter((_, j) => j !== i),
                    })
                  }
                >
                  <X size={18} />
                </button>
              </div>
              {group.options.map((option, j) => (
                <div className="option-fields addon-option-fields" key={j}>
                  <label>
                    Option
                    <input
                      required
                      value={option.name}
                      onChange={(e) =>
                        optionChange(i, j, { name: e.target.value })
                      }
                      placeholder="Oat milk"
                    />
                  </label>
                  <label>
                    Price increase
                    <IdrInput
                      required
                      value={option.price_delta}
                      onValueChange={(price_delta) =>
                        optionChange(i, j, { price_delta })
                      }
                    />
                  </label>
                  <label>
                    Cost increase (IDR)
                    <IdrInput
                      required
                      value={option.cost_delta ?? 0}
                      onValueChange={(cost_delta) =>
                        optionChange(i, j, { cost_delta })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button danger"
                    disabled={group.options.length === 1}
                    aria-label="Remove option"
                    onClick={() =>
                      groupChange(i, {
                        options: group.options.filter((_, k) => k !== j),
                      })
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  groupChange(i, {
                    options: [
                      ...group.options,
                      { name: "", price_delta: "0", cost_delta: "0" },
                    ],
                  })
                }
              >
                <Plus size={15} /> Add option
              </button>
            </div>
          ))}
        </div>
      </section>
      <footer className="settings-actions">
        <span>Changes apply to this store.</span>
        <button className="button primary" disabled={busy || uploading}>
          {busy ? "Saving..." : product?.id ? "Save product" : "Create product"}
        </button>
      </footer>
    </form>
  );
}
