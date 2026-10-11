import { t, message, useI18n, categoryLabel } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { navigate, pagePaths, useLocation } from "@/lib/navigation";
import { money } from "@/lib/reports";
import { useRegister } from "@/components/register-provider";

export function ProductList() {
  useI18n();
  const { auth, db, products, setNotice, loadCatalog } = useRegister();
  const { pathname } = useLocation();
  const viewer = auth.role === "viewer";
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [productSort, setProductSort] = useState("name");
  const productTrash = pathname === "/products/deleted" && auth.is_superadmin;
  const [deletedProducts, setDeletedProducts] = useState([]);
  const listedProducts = productTrash ? deletedProducts : products;
  const listCategories = [
    ...new Set(listedProducts.map((product) => product.category || "lainnya")),
  ].sort((a, b) => a.localeCompare(b));
  const selectedCategory = listCategories.includes(productCategory)
    ? productCategory
    : "all";
  const productQuery = productSearch.trim().toLocaleLowerCase();
  const visibleProducts = listedProducts
    .filter(
      (product) =>
        (selectedCategory === "all" ||
          (product.category || "lainnya") === selectedCategory) &&
        `${product.name} ${product.sku} ${product.category || "lainnya"} ${categoryLabel(product.category || "lainnya")}`
          .toLocaleLowerCase()
          .includes(productQuery),
    )
    .sort((a, b) =>
      productSort === "price-asc"
        ? a.price - b.price || a.name.localeCompare(b.name)
        : productSort === "price-desc"
          ? b.price - a.price || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  const hasProductFilters =
    !!productSearch || selectedCategory !== "all" || productSort !== "name";
  async function loadDeletedProducts() {
    try {
      setDeletedProducts(
        await api(`/stores/${auth.store_id}/products?trash=true`),
      );
    } catch (error) {
      setNotice(error.message);
    }
  }
  useEffect(() => {
    if (productTrash && auth?.store_id) loadDeletedProducts();
  }, [productTrash, auth?.store_id]);
  async function changeProduct(product, restore) {
    if (
      !restore &&
      !confirm(t("delete_product_confirmation", { product: product.name }))
    )
      return;
    try {
      await api(
        `/stores/${auth.store_id}/products/${product.id}${restore ? "/restore" : ""}`,
        { method: restore ? "POST" : "DELETE" },
      );
      await loadCatalog(db, auth);
      if (productTrash) await loadDeletedProducts();
      setNotice(
        restore ? message("product_restored") : message("product_deleted"),
      );
    } catch (error) {
      setNotice(error.message);
    }
  }

  if (pathname === "/products/deleted" && !auth.is_superadmin)
    return (
      <section className="products-page">
        <h1>{t("access_restricted")}</h1>
      </section>
    );
  return (
    <section className="products-page">
      {productTrash && (
        <button
          className="link-button report-back"
          onClick={() => navigate(pagePaths.products, true)}
        >
          {t("back_to_products")}
        </button>
      )}
      <div className="page-heading heading-row">
        <div>
          <small>{t("catalog")}</small>
          <h1>{productTrash ? t("deleted_products") : t("products")}</h1>
          <p>
            {productTrash
              ? t("restore_products_for_this_store")
              : t("set_prices_and_add_on_choices_for_this_store")}
          </p>
        </div>
        {!productTrash && !viewer && (auth.role !== "cashier" || auth.is_superadmin) && (
          <button
            className="button primary"
            onClick={() => navigate("/products/new")}
          >
            <Plus size={18} /> {t("new_product")}
          </button>
        )}
      </div>
      <div className="product-list-controls">
        <label>
          {t("search_products")}
          <input
            type="search"
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder={t("name_sku_or_category")}
          />
        </label>
        <label>
          {t("category")}
          <select
            value={selectedCategory}
            onChange={(event) => setProductCategory(event.target.value)}
          >
            <option value="all">{t("all_categories")}</option>
            {listCategories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("sort_by")}
          <select
            value={productSort}
            onChange={(event) => setProductSort(event.target.value)}
          >
            <option value="name">{t("name_a_z")}</option>
            <option value="price-asc">{t("price_low_to_high")}</option>
            <option value="price-desc">{t("price_high_to_low")}</option>
          </select>
        </label>
        {hasProductFilters && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setProductSearch("");
              setProductCategory("all");
              setProductSort("name");
            }}
          >
            {t("clear_filters")}
          </button>
        )}
      </div>
      <div className="table-card product-list">
        <div className="table-head">
          <strong>
            {t("product_results", {
              shown: visibleProducts.length,
              total: listedProducts.length,
            })}
          </strong>
          <span>{t("prices_in_idr")}</span>
          {auth.is_superadmin && !productTrash && (
            <button
              className="button secondary"
              onClick={() => navigate("/products/deleted")}
            >
              {t("deleted_products")}
            </button>
          )}
        </div>
        {visibleProducts.map((product) => (
          <div className="product-row" key={product.id}>
            {product.image_urls?.[0] ? (
              <img
                className="product-photo compact"
                src={product.image_urls[0]}
                alt={product.name}
              />
            ) : (
              <span className="product-icon compact">
                {product.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <strong>{product.name}</strong>
              {product.ad_hoc_pending && <small>{t("pending_sync")}</small>}
              <small>
                {categoryLabel(product.category || "lainnya")} · {product.sku} ·{" "}
                {t("product_assets", {
                  groups: product.addon_groups.length,
                  images: product.image_urls?.length || 0,
                })}
              </small>
            </div>
            <strong>{money(product.price)}</strong>
            {productTrash ? (
              !viewer && auth.is_superadmin && (
                <button
                  className="button secondary"
                  onClick={() => changeProduct(product, true)}
                >
                  {t("restore")}
                </button>
              )
            ) : (
              <div className="product-actions">
                {!viewer && (auth.role === "owner" ||
                  auth.role === "admin" ||
                  auth.is_superadmin) && (
                  <button
                    className="icon-button danger"
                    aria-label={t("delete_product", { product: product.name })}
                    onClick={() => changeProduct(product, false)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
                {!viewer && (auth.role !== "cashier" || auth.is_superadmin) && (
                  <button
                    className="icon-button"
                    aria-label={t("edit_named_product", {
                      product: product.name,
                    })}
                    onClick={() => navigate(`/products/${product.id}/edit`)}
                  >
                    <Pencil size={17} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {visibleProducts.length === 0 && (
          <div className="empty">
            <Package size={30} />
            <strong>
              {listedProducts.length
                ? t("no_matching_products")
                : t("no_products_found")}
            </strong>
            <p>
              {listedProducts.length
                ? t("try_another_search_or_category")
                : productTrash
                  ? t("no_deleted_products_in_this_store")
                  : t("create_a_product_to_add_it_to_this_store")}
            </p>
            {listedProducts.length > 0 && hasProductFilters && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setProductSearch("");
                  setProductCategory("all");
                  setProductSort("name");
                }}
              >
                {t("clear_filters")}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
