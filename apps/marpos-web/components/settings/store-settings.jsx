import { useEffect, useState } from "react";
export function StoreSettings({
  auth,
  onSave,
  dangerZoneEnabled,
  onClear,
  clearing,
}) {
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
          <small>ACTIVE STORE</small>
          <h2>{auth.store_name}</h2>
          <p>Manage this store's details and checkout tax.</p>
        </div>
      </header>
      <section
        className="settings-section"
        aria-labelledby="store-identity-heading"
      >
        <div className="settings-section-copy">
          <span>01 / STORE</span>
          <h3 id="store-identity-heading">Store identity</h3>
          <p>Set the name and slug for this store.</p>
        </div>
        <div className="settings-fields">
          <label>
            Store name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Slug
            <input
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <small>
              Use lowercase letters, numbers, and hyphens. The slug must be
              unique.
            </small>
          </label>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="store-location-heading"
      >
        <div className="settings-section-copy">
          <span>02 / LOCATION</span>
          <h3 id="store-location-heading">Location</h3>
          <p>Add the address and Google Maps link for this store.</p>
        </div>
        <div className="settings-fields">
          <label>
            Street address
            <textarea
              rows={3}
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, building, city, and postal code"
            />
          </label>
          <label>
            Google Maps link
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
          <span>03 / SOCIAL</span>
          <h3 id="store-social-heading">Social links</h3>
          <p>
            Help customers find your store online. Add only the links you use.
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
              placeholder="https://www.instagram.com/yourstore"
            />
          </label>
          <label>
            Facebook
            <input
              type="url"
              maxLength={2048}
              value={facebookURL}
              onChange={(e) => setFacebookURL(e.target.value)}
              placeholder="https://www.facebook.com/yourstore"
            />
          </label>
          <label>
            TikTok
            <input
              type="url"
              maxLength={2048}
              value={tiktokURL}
              onChange={(e) => setTikTokURL(e.target.value)}
              placeholder="https://www.tiktok.com/@yourstore"
            />
          </label>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="store-tax-heading">
        <div className="settings-section-copy">
          <span>04 / CHECKOUT</span>
          <h3 id="store-tax-heading">Tax</h3>
          <p>
            Tax is added by default. The cashier can turn it off for one sale.
          </p>
        </div>
        <div className="settings-fields">
          <label>
            Tax percentage
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
            <span>05 / DANGER ZONE</span>
            <h3 id="danger-zone-heading">Danger zone</h3>
            <p>These actions permanently remove store data.</p>
          </div>
          <div className="settings-fields">
            <div className="danger-action">
              <div>
                <strong>Clear all orders</strong>
                <p>
                  Delete every order, including deleted orders, from this store.
                </p>
              </div>
              <button
                type="button"
                className="button danger-button"
                disabled={!!clearing}
                onClick={() => onClear("sales")}
              >
                {clearing === "sales" ? "Clearing…" : "Clear all orders"}
              </button>
            </div>
            <div className="danger-action">
              <div>
                <strong>Clear all products and orders</strong>
                <p>Delete every product, image, and order from this store.</p>
              </div>
              <button
                type="button"
                className="button danger-button"
                disabled={!!clearing}
                onClick={() => onClear("products")}
              >
                {clearing === "products" ? "Clearing…" : "Clear all products"}
              </button>
            </div>
          </div>
        </section>
      )}
      <footer className="settings-actions">
        <span>Changes apply to this store.</span>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving..." : "Save changes"}
        </button>
      </footer>
    </form>
  );
}
