import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export function TeamPage({ auth, onNotice }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");
  const [busy, setBusy] = useState(false);
  const canManage = auth.role === "owner" || auth.role === "admin";
  const load = () =>
    api(`/stores/${auth.store_id}/members`)
      .then(setMembers)
      .catch((error) => onNotice(error.message));
  useEffect(() => {
    load();
  }, [auth.store_id]);
  async function invite(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/stores/${auth.store_id}/invitations`, {
        method: "POST",
        body: { email, role },
      });
      setEmail("");
      onNotice("Invitation is ready in the user's app.");
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function change(member, nextRole) {
    try {
      await api(`/stores/${auth.store_id}/members/${member.user_id}`, {
        method: "PUT",
        body: { role: nextRole },
      });
      await load();
    } catch (error) {
      onNotice(error.message);
    }
  }
  async function remove(member) {
    if (!confirm(`Remove ${member.name} from this store?`)) return;
    try {
      await api(`/stores/${auth.store_id}/members/${member.user_id}`, {
        method: "DELETE",
      });
      await load();
    } catch (error) {
      onNotice(error.message);
    }
  }
  return (
    <section className="products-page">
      <div className="page-heading">
        <small>STORE</small>
        <h1>Team</h1>
        <p>Each user has one role in this store.</p>
      </div>
      {canManage && (
        <form className="invite-form" onSubmit={invite}>
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              {auth.role === "owner" && <option value="admin">Admin</option>}
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            Send invitation
          </button>
        </form>
      )}
      <div className="table-card">
        <div className="table-head">
          <strong>{members.length} members</strong>
        </div>
        {members.map((member) => (
          <div className="team-row" key={member.user_id}>
            <div>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </div>
            {canManage &&
            member.role !== "owner" &&
            member.user_id !== auth.user_id &&
            (auth.role === "owner" || member.role !== "admin") ? (
              <>
                <select
                  aria-label={`Role for ${member.name}`}
                  value={member.role}
                  onChange={(event) => change(member, event.target.value)}
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  {auth.role === "owner" && (
                    <option value="admin">Admin</option>
                  )}
                </select>
                <button
                  className="button secondary"
                  onClick={() => remove(member)}
                >
                  Remove
                </button>
              </>
            ) : (
              <span>{member.role}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
