import { t, message, translateMessage, useI18n, formatLocale, en } from "@/lib/i18n";
import { useQueryState } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { getMeta, localFinance, putMeta, saveFinance } from "@/lib/local-db";
import { money, storeDate } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";

import { api } from "@/lib/api";
import { RangeFilter } from "@/components/reports/range-filter";
import { useRange, validRange } from "@/hooks/use-report-range";
export function FinancePage({ db, auth, pending, onNotice, onSaved }) {
  useI18n();
  const [range, setRange] = useRange();
  const [rows, setRows] = useState([]);
  const [recordStatus, setRecordStatus] = useQueryState("status");
  const trash = recordStatus === "deleted" && auth.is_superadmin;
  const setTrash = (deleted) => setRecordStatus(deleted ? "deleted" : null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const blank = () => ({
    mode: "expense",
    category: en.staff_pay,
    description: "",
    amount: "",
    date: storeDate(),
    hour: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  });
  const [form, setForm] = useState(blank);
  const viewer = auth.role === "viewer";
  const admin = !viewer && (["owner", "admin"].includes(auth.role) || auth.is_superadmin);
  const cacheKey = `finance:${auth.store_id}:${range.from}:${range.to}:${trash}`;
  async function load() {
    if (!db || !validRange(range)) return;
    const current = ++generation.current;
    let cached = await getMeta(db, cacheKey),
      remote = Array.isArray(cached) ? cached : cached?.entries || [];
    try {
      remote = await api(
        `/stores/${auth.store_id}/finance?from=${range.from}&to=${range.to}&trash=${trash}`,
      );
      cached = { entries: remote, generated_at: new Date().toISOString() };
      await putMeta(db, cacheKey, cached);
      setStatus(message("synced_records_and_pending_records_on_this_device"));
    } catch {
      setStatus(
        message(
          "offline_cached_records_and_pending_records_on_this_device_are_shown",
        ),
      );
    }
    const local = trash
      ? []
      : (await localFinance(db, auth.store_id)).filter(
          (row) =>
            (row.sync_status === "pending" ||
              (row.synced_at &&
                new Date(row.synced_at) >
                  new Date(cached?.generated_at || 0))) &&
            storeDate(row.occurred_at) >= range.from &&
            storeDate(row.occurred_at) <= range.to,
        );
    const ids = new Set(remote.map((row) => row.id));
    if (current !== generation.current) return;
    setRows(
      [...remote, ...local.filter((row) => !ids.has(row.id))].sort(
        (a, b) => new Date(b.occurred_at) - new Date(a.occurred_at),
      ),
    );
  }
  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
  }, [db, auth.store_id, range.from, range.to, trash, pending]);
  async function save(event) {
    event.preventDefault();
    if (!db || busy) return;
    if (new Date(auth.offline_expires_at) <= new Date()) {
      onNotice(message("sign_in_online_again_before_you_record_an_entry"));
      return;
    }
    const amount = Number(form.amount);
    const occurredAt = new Date(`${form.date}T${form.hour}:00+07:00`);
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 1e12 ||
      !form.category.trim() ||
      !form.description.trim() ||
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt > new Date()
    ) {
      onNotice(message("check_the_amount_category_description_and_date"));
      return;
    }
    setBusy(true);
    try {
      await saveFinance(db, {
        id: crypto.randomUUID(),
        store_id: auth.store_id,
        created_by: auth.user_id,
        mode: form.mode,
        category: form.category.trim(),
        description: form.description.trim(),
        amount,
        occurred_at: occurredAt.toISOString(),
      });
      setForm(blank());
      onNotice(message("record_saved_on_this_device"));
      onSaved();
      load().catch(() =>
        onNotice(message("record_saved_reload_the_page_to_see_the_list")),
      );
    } catch {
      onNotice(message("record_was_not_saved_keep_the_form_and_try_again"));
    } finally {
      setBusy(false);
    }
  }
  async function change(row) {
    if (!trash && !confirm(t("move_this_financial_record_to_deleted_records")))
      return;
    try {
      await api(
        `/stores/${auth.store_id}/finance/${row.id}${trash ? "/restore" : ""}`,
        { method: trash ? "POST" : "DELETE" },
      );
      await load();
    } catch (error) {
      onNotice(error.message);
    }
  }
  return (
    <section className="products-page">
      <div className="page-heading">
        <small>{t("finances")}</small>
        <h1>{t("income_and_expenses")}</h1>
        <p>
          {t(
            "record_staff_pay_and_other_store_income_or_expenses_do_not_record_checkout_sales_again",
          )}
        </p>
      </div>
      {!viewer && (
        <form className="form-card product-form" onSubmit={save}>
          <h2>{t("new_record")}</h2>
          <div className="form-grid">
            <label>
              {t("type")}
              <select
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="expense">{t("expense")}</option>
                <option value="income">{t("income")}</option>
              </select>
            </label>
            <label>
              {t("category")}
              <input
                required
                list="finance-categories"
                maxLength={80}
                value={translateMessage(form.category)}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="finance-categories">
                {[
                  t("staff_pay"),
                  t("rent"),
                  t("utilities"),
                  t("transport"),
                  t("supplies"),
                  t("other_income"),
                  t("other"),
                ].map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label>
              {t("amount_idr")}
              <IdrInput
                required
                min={1}
                value={form.amount}
                onValueChange={(amount) => setForm({ ...form, amount })}
              />
            </label>
            <label>
              {t("date_wib")}
              <input
                required
                type="date"
                max={storeDate()}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              {t("time_wib")}
              <input
                required
                type="time"
                value={form.hour}
                onChange={(e) => setForm({ ...form, hour: e.target.value })}
              />
            </label>
            <label>
              {t("description")}
              <input
                required
                maxLength={1000}
                placeholder={t("daily_pay_for_two_staff")}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={busy || !db}>
              {busy ? t("saving") : t("save_record")}
            </button>
          </div>
        </form>
      )}
      <div className="heading-row">
        <RangeFilter range={range} onChange={setRange} />
        {auth.is_superadmin && (
          <button className="button secondary" onClick={() => setTrash(!trash)}>
            {trash ? t("active_records") : t("deleted_records")}
          </button>
        )}
      </div>
      {!validRange(range) ? (
        <p className="message">
          {t("select_up_to_366_days_ending_today_or_earlier")}
        </p>
      ) : (
        <>
          <p className="report-status" role="status">
            {translateMessage(status)}
          </p>
          <div className="table-card orders-scroll">
            <table className="orders-table finance-table">
              <thead>
                <tr>
                  <th>{t("date_wib")}</th>
                  <th>{t("type")}</th>
                  <th>{t("category")}</th>
                  <th>{t("description")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("status")}</th>
                  {admin && <th>{t("action")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(row.occurred_at).toLocaleString(
                        formatLocale(),
                        {
                          timeZone: "Asia/Jakarta",
                        },
                      )}
                    </td>
                    <td>{t(row.mode === "income" ? "income" : "expense")}</td>
                    <td>{translateMessage(row.category)}</td>
                    <td>{row.description}</td>
                    <td>{money(row.amount)}</td>
                    <td>
                      {row.sync_status === "pending"
                        ? t("pending_sync")
                        : trash
                          ? t("deleted")
                          : t("synced")}
                    </td>
                    {admin && (
                      <td>
                        {row.sync_status !== "pending" &&
                          (!trash || auth.is_superadmin) && (
                            <button
                              className="button secondary"
                              onClick={() => change(row)}
                            >
                              {trash ? t("restore") : t("delete")}
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">{t("no_records_in_this_period")}</div>
            )}
            {rows.length >= 5000 && (
              <p className="message">
                {t(
                  "only_the_latest_5_000_records_are_shown_select_a_shorter_period",
                )}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
