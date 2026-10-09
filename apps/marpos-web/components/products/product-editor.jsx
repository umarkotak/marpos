import { t, message, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/lib/api";
import { productCategories } from "@/lib/catalog";
import { navigate, pagePaths } from "@/lib/navigation";
import { useRegister } from "@/components/register-provider";
import { ProductForm } from "./product-form";

export function ProductEditor() {
  useI18n();
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
      setNotice(message("product_saved"));
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
        {t("back_to_products")}
      </button>
      <div className="page-heading">
        <small>{t("catalog")}</small>
        <h1>{productID ? t("edit_product") : t("new_product")}</h1>
        <p>{t("manage_product_details_images_costs_and_add_ons")}</p>
      </div>
      {auth.role === "cashier" && !auth.is_superadmin ? (
        <p>{t("access_restricted_label")}</p>
      ) : productID && !editing ? (
        <p>{t("product_not_found")}</p>
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
