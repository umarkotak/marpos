import { useQueryState } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";
import { getMeta, localFinance, putMeta, saveFinance } from "@/lib/local-db";
import { money, storeDate } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";

import { api } from "@/lib/api";
import { RangeFilter } from "@/components/reports/range-filter";
import { useRange, validRange } from "@/hooks/use-report-range";
export function FinancePage({ db, auth, pending, onNotice, onSaved }) {
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
    category: "Staff pay",
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
  const admin = ["owner", "admin"].includes(auth.role) || auth.is_superadmin;
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
      setStatus("Synced records and pending records on this device.");
    } catch {
      setStatus(
        "Offline. Cached records and pending records on this device are shown.",
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
      onNotice("Sign in online again before you record an entry.");
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
      onNotice("Check the amount, category, description, and date.");
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
      onNotice("Record saved on this device.");
      onSaved();
      load().catch(() =>
        onNotice("Record saved. Reload the page to see the list."),
      );
    } catch {
      onNotice("Record was not saved. Keep the form and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function change(row) {
    if (!trash && !confirm("Move this financial record to deleted records?"))
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
        <small>FINANCES</small>
        <h1>Income and expenses</h1>
        <p>
          Record staff pay and other store income or expenses. Do not record
          checkout sales again.
        </p>
      </div>
      <form className="form-card product-form" onSubmit={save}>
        <h2>New record</h2>
        <div className="form-grid">
          <label>
            Type
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Category
            <input
              required
              list="finance-categories"
              maxLength={80}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <datalist id="finance-categories">
              {[
                "Staff pay",
                "Rent",
                "Utilities",
                "Transport",
                "Supplies",
                "Other income",
                "Other",
              ].map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label>
            Amount (IDR)
            <IdrInput
              required
              min={1}
              value={form.amount}
              onValueChange={(amount) => setForm({ ...form, amount })}
            />
          </label>
          <label>
            Date (WIB)
            <input
              required
              type="date"
              max={storeDate()}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Time (WIB)
            <input
              required
              type="time"
              value={form.hour}
              onChange={(e) => setForm({ ...form, hour: e.target.value })}
            />
          </label>
          <label>
            Description
            <input
              required
              maxLength={1000}
              placeholder="Daily pay for two staff"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={busy || !db}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
      <div className="heading-row">
        <RangeFilter range={range} onChange={setRange} />
        {auth.is_superadmin && (
          <button className="button secondary" onClick={() => setTrash(!trash)}>
            {trash ? "Active records" : "Deleted records"}
          </button>
        )}
      </div>
      {!validRange(range) ? (
        <p className="message">
          Select up to 366 days, ending today or earlier.
        </p>
      ) : (
        <>
          <p className="report-status" role="status">
            {status}
          </p>
          <div className="table-card orders-scroll">
            <table className="orders-table finance-table">
              <thead>
                <tr>
                  <th>Date (WIB)</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  {admin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(row.occurred_at).toLocaleString("en-GB", {
                        timeZone: "Asia/Jakarta",
                      })}
                    </td>
                    <td>{row.mode}</td>
                    <td>{row.category}</td>
                    <td>{row.description}</td>
                    <td>{money(row.amount)}</td>
                    <td>
                      {row.sync_status === "pending"
                        ? "Pending sync"
                        : trash
                          ? "Deleted"
                          : "Synced"}
                    </td>
                    {admin && (
                      <td>
                        {row.sync_status !== "pending" &&
                          (!trash || auth.is_superadmin) && (
                            <button
                              className="button secondary"
                              onClick={() => change(row)}
                            >
                              {trash ? "Restore" : "Delete"}
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">No records in this period.</div>
            )}
            {rows.length >= 5000 && (
              <p className="message">
                Only the latest 5,000 records are shown. Select a shorter
                period.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
