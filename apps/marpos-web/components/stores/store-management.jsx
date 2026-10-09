import { t, translateMessage, useI18n, roleLabel } from "@/lib/i18n";
import { useState } from "react";

export function StoreManagement({
  stores,
  invitations,
  onCreate,
  onSelect,
  onDecide,
  onLogout,
  notice,
}) {
  useI18n();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (await onCreate({ name, slug })) {
        setName("");
        setSlug("");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="management-screen">
      <section className="management-card">
        <span className="logo">M</span>
        {onLogout && (
          <button
            className="button secondary"
            style={{ float: "right" }}
            onClick={onLogout}
          >
            {t("sign_out")}
          </button>
        )}
        <h1>{t("manage_stores")}</h1>
        <p>{t("create_a_store_or_select_one_you_can_use")}</p>
        {notice && (
          <p className="message" role="status">
            {translateMessage(notice)}
          </p>
        )}
        {stores.map((store) => (
          <button
            className="store-choice"
            key={store.id}
            onClick={() => onSelect(store)}
          >
            <span>
              <strong>{store.name}</strong>
              <small>{roleLabel(store.role)}</small>
            </span>
            <span>{t("open")}</span>
          </button>
        ))}
        <form onSubmit={create} className="create-store">
          <label>
            {t("new_store_name")}
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("my_store")}
            />
          </label>
          <label>
            {t("slug")}
            <input
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={t("store_slug_example")}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {t("create_store")}
          </button>
        </form>
        {invitations.length > 0 && (
          <div className="invitation-list">
            <h2>{t("invitations")}</h2>
            {invitations.map((invite) => (
              <div className="invitation-row" key={invite.id}>
                <div>
                  <strong>{invite.store_name}</strong>
                  <small>
                    {t("role")} {roleLabel(invite.role)}
                  </small>
                </div>
                <button
                  className="button primary"
                  onClick={() => onDecide(invite.id, true)}
                >
                  {t("accept")}
                </button>
                <button
                  className="button secondary"
                  onClick={() => onDecide(invite.id, false)}
                >
                  {t("reject")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
