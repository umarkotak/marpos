import { t, useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
export function StoreSettings({
  auth,
  onSave,
  dangerZoneEnabled,
  onClear,
  clearing,
}) {
  useI18n();
  const [name, setName] = useState(auth.store_name);
  const [slug, setSlug] = useState(auth.slug || "");
  const [address, setAddress] = useState(auth.address || "");
  const [googleMapsURL, setGoogleMapsURL] = useState(
    auth.google_maps_url || "",
  );
  const [instagramURL, setInstagramURL] = useState(auth.instagram_url || "");
  const [facebookURL, setFacebookURL] = useState(auth.facebook_url || "");
  const [tiktokURL, setTikTokURL] = useState(auth.tiktok_url || "");
  const [tax, setTax] = useState(String(auth.tax_percentage));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(auth.store_name);
    setSlug(auth.slug || "");
    setAddress(auth.address || "");
    setGoogleMapsURL(auth.google_maps_url || "");
    setInstagramURL(auth.instagram_url || "");
    setFacebookURL(auth.facebook_url || "");
    setTikTokURL(auth.tiktok_url || "");
    setTax(String(auth.tax_percentage));
  }, [
    auth.store_name,
    auth.slug,
    auth.address,
    auth.google_maps_url,
    auth.instagram_url,
    auth.facebook_url,
    auth.tiktok_url,
    auth.tax_percentage,
  ]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({
        name,
        slug,
        address,
        google_maps_url: googleMapsURL,
        instagram_url: instagramURL,
        facebook_url: facebookURL,
        tiktok_url: tiktokURL,
        tax_percentage: Number(tax),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="settings-card" onSubmit={submit}>
      <header className="settings-profile">
        <span className="settings-avatar" aria-hidden="true">
          {auth.store_name?.charAt(0).toUpperCase() || "S"}
        </span>
        <div>
          <small>{t("active_store")}</small>
          <h2>{auth.store_name}</h2>
          <p>{t("manage_this_store_s_details_and_checkout_tax")}</p>
        </div>
      </header>
      <section
        className="settings-section"
        aria-labelledby="store-identity-heading"
      >
        <div className="settings-section-copy">
          <span>{t("01_store")}</span>
          <h3 id="store-identity-heading">{t("store_identity")}</h3>
          <p>{t("set_the_name_and_slug_for_this_store")}</p>
        </div>
        <div className="settings-fields">
          <label>
            {t("store_name")}
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {t("slug")}
            <input
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <small>
              {t(
                "use_lowercase_letters_numbers_and_hyphens_the_slug_must_be_unique",
              )}
            </small>
          </label>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="store-location-heading"
      >
        <div className="settings-section-copy">
          <span>{t("02_location")}</span>
          <h3 id="store-location-heading">{t("location")}</h3>
          <p>{t("add_the_address_and_google_maps_link_for_this_store")}</p>
        </div>
        <div className="settings-fields">
          <label>
            {t("street_address")}
            <textarea
              rows={3}
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("street_building_city_and_postal_code")}
            />
          </label>
          <label>
            {t("google_maps_link")}
            <input
              type="url"
              maxLength={2048}
              value={googleMapsURL}
              onChange={(e) => setGoogleMapsURL(e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
            />
          </label>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="store-social-heading"
      >
        <div className="settings-section-copy">
          <span>{t("03_social")}</span>
          <h3 id="store-social-heading">{t("social_links")}</h3>
          <p>
            {t(
              "help_customers_find_your_store_online_add_only_the_links_you_use",
            )}
          </p>
        </div>
        <div className="settings-fields">
          <label>
            Instagram
            <input
              type="url"
              maxLength={2048}
              value={instagramURL}
              onChange={(e) => setInstagramURL(e.target.value)}
              placeholder={t("instagram_url_example")}
            />
          </label>
          <label>
            Facebook
            <input
              type="url"
              maxLength={2048}
              value={facebookURL}
              onChange={(e) => setFacebookURL(e.target.value)}
              placeholder={t("facebook_url_example")}
            />
          </label>
          <label>
            TikTok
            <input
              type="url"
              maxLength={2048}
              value={tiktokURL}
              onChange={(e) => setTikTokURL(e.target.value)}
              placeholder={t("tiktok_url_example")}
            />
          </label>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="store-tax-heading">
        <div className="settings-section-copy">
          <span>{t("04_checkout")}</span>
          <h3 id="store-tax-heading">{t("tax_label")}</h3>
          <p>
            {t(
              "tax_is_added_by_default_the_cashier_can_turn_it_off_for_one_sale",
            )}
          </p>
        </div>
        <div className="settings-fields">
          <label>
            {t("tax_percentage")}
            <div className="settings-number">
              <input
                required
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
              <span aria-hidden="true">%</span>
            </div>
          </label>
        </div>
      </section>
      {dangerZoneEnabled && (auth.role === "owner" || auth.is_superadmin) && (
        <section
          className="settings-section danger-zone"
          aria-labelledby="danger-zone-heading"
        >
          <div className="settings-section-copy">
            <span>{t("05_danger_zone")}</span>
            <h3 id="danger-zone-heading">{t("danger_zone")}</h3>
            <p>{t("these_actions_permanently_remove_store_data")}</p>
          </div>
          <div className="settings-fields">
            <div className="danger-action">
              <div>
                <strong>{t("clear_all_orders")}</strong>
                <p>
                  {t(
                    "delete_every_order_including_deleted_orders_from_this_store",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="button danger-button"
                disabled={!!clearing}
                onClick={() => onClear("sales")}
              >
                {clearing === "sales" ? t("clearing") : t("clear_all_orders")}
              </button>
            </div>
            <div className="danger-action">
              <div>
                <strong>{t("clear_all_products_and_orders")}</strong>
                <p>
                  {t("delete_every_product_image_and_order_from_this_store")}
                </p>
              </div>
              <button
                type="button"
                className="button danger-button"
                disabled={!!clearing}
                onClick={() => onClear("products")}
              >
                {clearing === "products"
                  ? t("clearing")
                  : t("clear_all_products")}
              </button>
            </div>
          </div>
        </section>
      )}
      <footer className="settings-actions">
        <span>{t("changes_apply_to_this_store")}</span>
        <button className="button primary" disabled={busy}>
          {busy ? t("saving_label") : t("save_changes")}
        </button>
      </footer>
    </form>
  );
}
