import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/lib/api";
import { productCategories } from "@/lib/catalog";
import { navigate, pagePaths } from "@/lib/navigation";
import { useRegister } from "@/components/register-provider";
import { ProductForm } from "./product-form";

export function ProductEditor() {
  const { query } = useRouter();
  const productID = query.id;
  const { auth, db, products, setNotice, loadCatalog } = useRegister();
  const editing = products.find((product) => product.id === productID);
  const [busy, setBusy] = useState(false);
  const [productUploading, setProductUploading] = useState(false);
  async function saveProduct(input) {
    setBusy(true);
    try {
      await api(
        `/stores/${auth.store_id}/products${productID ? `/${productID}` : ""}`,
        { method: productID ? "PUT" : "POST", body: input },
      );
      await loadCatalog(db, auth);
      navigate(pagePaths.products, true);
      setNotice("Product saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="products-page">
      <button
        className="link-button report-back"
        onClick={() => navigate(pagePaths.products, true)}
      >
        ← Back to products
      </button>
      <div className="page-heading">
        <small>CATALOG</small>
        <h1>{productID ? "Edit product" : "New product"}</h1>
        <p>Manage product details, images, costs, and add-ons.</p>
      </div>
      {auth.role === "cashier" && !auth.is_superadmin ? (
        <p>Access restricted.</p>
      ) : productID && !editing ? (
        <p>Product not found.</p>
      ) : (
        <ProductForm
          key={productID || "new"}
          product={editing}
          storeID={auth.store_id}
          categories={productCategories(products)}
          onSave={saveProduct}
          onNotice={setNotice}
          busy={busy}
          uploading={productUploading}
          setUploading={setProductUploading}
        />
      )}
    </section>
  );
}
