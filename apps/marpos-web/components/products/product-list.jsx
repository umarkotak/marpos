import { useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { navigate, pagePaths, useLocation } from "@/lib/navigation";
import { money } from "@/lib/reports";
import { useRegister } from "@/components/register-provider";

export function ProductList() {
  const { auth, db, products, setNotice, loadCatalog } = useRegister();
  const { pathname } = useLocation();
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
        `${product.name} ${product.sku} ${product.category || "lainnya"}`
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
    if (!restore && !confirm(`Delete ${product.name}?`)) return;
    try {
      await api(
        `/stores/${auth.store_id}/products/${product.id}${restore ? "/restore" : ""}`,
        { method: restore ? "POST" : "DELETE" },
      );
      await loadCatalog(db, auth);
      if (productTrash) await loadDeletedProducts();
      setNotice(restore ? "Product restored." : "Product deleted.");
    } catch (error) {
      setNotice(error.message);
    }
  }

  if (pathname === "/products/deleted" && !auth.is_superadmin)
    return (
      <section className="products-page">
        <h1>Access restricted</h1>
      </section>
    );
  return (
    <section className="products-page">
      {productTrash && (
        <button
          className="link-button report-back"
          onClick={() => navigate(pagePaths.products, true)}
        >
          ← Back to products
        </button>
      )}
      <div className="page-heading heading-row">
        <div>
          <small>CATALOG</small>
          <h1>{productTrash ? "Deleted products" : "Products"}</h1>
          <p>
            {productTrash
              ? "Restore products for this store."
              : "Set prices and add-on choices for this store."}
          </p>
        </div>
        {!productTrash && (auth.role !== "cashier" || auth.is_superadmin) && (
          <button
            className="button primary"
            onClick={() => navigate("/products/new")}
          >
            <Plus size={18} /> New product
          </button>
        )}
      </div>
      <div className="product-list-controls">
        <label>
          Search products
          <input
            type="search"
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Name, SKU, or category"
          />
        </label>
        <label>
          Category
          <select
            value={selectedCategory}
            onChange={(event) => setProductCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {listCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select
            value={productSort}
            onChange={(event) => setProductSort(event.target.value)}
          >
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
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
            Clear filters
          </button>
        )}
      </div>
      <div className="table-card product-list">
        <div className="table-head">
          <strong>
            {visibleProducts.length} of {listedProducts.length} products
          </strong>
          <span>Prices in IDR</span>
          {auth.is_superadmin && !productTrash && (
            <button
              className="button secondary"
              onClick={() => navigate("/products/deleted")}
            >
              Deleted products
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
              <small>
                {product.category || "lainnya"} · {product.sku} ·{" "}
                {product.addon_groups.length} add-on groups ·{" "}
                {product.image_urls?.length || 0} images
              </small>
            </div>
            <strong>{money(product.price)}</strong>
            {productTrash ? (
              auth.is_superadmin && (
                <button
                  className="button secondary"
                  onClick={() => changeProduct(product, true)}
                >
                  Restore
                </button>
              )
            ) : (
              <div className="product-actions">
                {(auth.role === "owner" ||
                  auth.role === "admin" ||
                  auth.is_superadmin) && (
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${product.name}`}
                    onClick={() => changeProduct(product, false)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
                {(auth.role !== "cashier" || auth.is_superadmin) && (
                  <button
                    className="icon-button"
                    aria-label={`Edit ${product.name}`}
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
                ? "No matching products"
                : "No products found"}
            </strong>
            <p>
              {listedProducts.length
                ? "Try another search or category."
                : productTrash
                  ? "No deleted products in this store."
                  : "Create a product to add it to this store."}
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
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
