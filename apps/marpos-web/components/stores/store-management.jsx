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
            Sign out
          </button>
        )}
        <h1>Manage stores</h1>
        <p>Create a store or select one you can use.</p>
        {notice && (
          <p className="message" role="status">
            {notice}
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
              <small>{store.role}</small>
            </span>
            <span>Open →</span>
          </button>
        ))}
        <form onSubmit={create} className="create-store">
          <label>
            New store name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Store"
            />
          </label>
          <label>
            Slug
            <input
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="my-store"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Create store
          </button>
        </form>
        {invitations.length > 0 && (
          <div className="invitation-list">
            <h2>Invitations</h2>
            {invitations.map((invite) => (
              <div className="invitation-row" key={invite.id}>
                <div>
                  <strong>{invite.store_name}</strong>
                  <small>Role: {invite.role}</small>
                </div>
                <button
                  className="button primary"
                  onClick={() => onDecide(invite.id, true)}
                >
                  Accept
                </button>
                <button
                  className="button secondary"
                  onClick={() => onDecide(invite.id, false)}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
