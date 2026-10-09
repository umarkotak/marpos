import { t, useI18n, categoryLabel } from "@/lib/i18n";
import { Package } from "lucide-react";
import { money } from "@/lib/reports";
import { useRegister } from "@/components/register-provider";
export function Catalog({
  categories,
  productsByCategory,
  chooseProduct,
  search,
  setSearch,
  filtered,
}) {
  useI18n();
  const { products, draftOrders, checkingOut } = useRegister();
  return (
    <section className="catalog">
      <div className="page-heading">
        <small>{t("checkout")}</small>
        <h1>{t("point_of_sale")}</h1>
        <p>{t("choose_products_to_start_a_sale")}</p>
      </div>
      <label className="search">
        {t("search_products")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("name_or_sku")}
        />
      </label>
      {categories.map(
        (category) =>
          productsByCategory.has(category) && (
            <div className="catalog-category" key={category}>
              <h2>{categoryLabel(category)}</h2>
              <div className="product-grid">
                {productsByCategory.get(category).map((product) => (
                  <button
                    className="product-card"
                    key={product.id}
                    disabled={!draftOrders.ready || checkingOut}
                    onClick={() => chooseProduct(product)}
                  >
                    {product.image_urls?.[0] ? (
                      <img
                        className="product-photo"
                        src={product.image_urls[0]}
                        alt={product.name}
                      />
                    ) : (
                      <span className="product-icon">
                        {product.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <strong>{product.name}</strong>
                    <b>{money(product.price)}</b>
                    {product.addon_groups.length > 0 && (
                      <em>{t("add_ons_available")}</em>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ),
      )}
      {filtered.length === 0 && (
        <div className="empty">
          <Package size={30} />
          <strong>
            {products.length ? t("no_matching_products") : t("no_products_yet")}
          </strong>
          <p>
            {products.length
              ? t("try_another_name_or_sku")
              : t("ask_a_manager_to_add_products_before_checkout")}
          </p>
        </div>
      )}
    </section>
  );
}
