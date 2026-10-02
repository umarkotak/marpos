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
  const { products, draftOrders, checkingOut } = useRegister();
  return (
    <section className="catalog">
      <div className="page-heading">
        <small>CHECKOUT</small>
        <h1>Point of sale</h1>
        <p>Choose products to start a sale.</p>
      </div>
      <label className="search">
        Search products
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or SKU"
        />
      </label>
      {categories.map(
        (category) =>
          productsByCategory.has(category) && (
            <div className="catalog-category" key={category}>
              <h2>{category}</h2>
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
                      <em>Add-ons available</em>
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
            {products.length ? "No matching products" : "No products yet"}
          </strong>
          <p>
            {products.length
              ? "Try another name or SKU."
              : "Ask a manager to add products before checkout."}
          </p>
        </div>
      )}
    </section>
  );
}
