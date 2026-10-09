import { t, message, useI18n, roleLabel } from "@/lib/i18n";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export function TeamPage({ auth, onNotice }) {
  useI18n();
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
      onNotice(message("invitation_is_ready_in_the_user_s_app"));
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
    if (!confirm(t("remove_member_confirmation", { member: member.name })))
      return;
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
        <small>{t("store_label")}</small>
        <h1>{t("team")}</h1>
        <p>{t("each_user_has_one_role_in_this_store")}</p>
      </div>
      {canManage && (
        <form className="invite-form" onSubmit={invite}>
          <label>
            {t("email")}
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            {t("role_label")}
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="cashier">{t("cashier")}</option>
              <option value="manager">{t("manager")}</option>
              {auth.role === "owner" && (
                <option value="admin">{t("admin")}</option>
              )}
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            {t("send_invitation")}
          </button>
        </form>
      )}
      <div className="table-card">
        <div className="table-head">
          <strong>{t("member_count", { count: members.length })}</strong>
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
                  aria-label={t("member_role", { member: member.name })}
                  value={roleLabel(member.role)}
                  onChange={(event) => change(member, event.target.value)}
                >
                  <option value="cashier">{t("cashier")}</option>
                  <option value="manager">{t("manager")}</option>
                  {auth.role === "owner" && (
                    <option value="admin">{t("admin")}</option>
                  )}
                </select>
                <button
                  className="button secondary"
                  onClick={() => remove(member)}
                >
                  {t("remove")}
                </button>
              </>
            ) : (
              <span>{roleLabel(member.role)}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
