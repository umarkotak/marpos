import { t, message } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { getMeta, putMeta, saveSale } from "@/lib/local-db";
import { blankBuyer } from "@/components/buyer-fields";
const newDraft = () => ({
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  items: [],
  buyer: { ...blankBuyer(), buyer_name: "Guest" },
  tax_on: true,
  payment_method_note: "cash",
});
const newWorkspace = () => {
  const draft = newDraft();
  return { active_id: draft.id, drafts: [draft] };
};
export function useOrderDrafts(db, auth, onNotice) {
  const key = auth?.store_id ? `drafts:${auth.user_id}:${auth.store_id}` : null;
  const [saved, setSaved] = useState(null),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  const current = useRef(null),
    writes = useRef(Promise.resolve()),
    locked = useRef(false);
  useEffect(() => {
    let active = true;
    setReady(false);
    current.current = null;
    if (db && key)
      getMeta(db, key)
        .then((value) => {
          if (active) {
            current.current = value || newWorkspace();
            current.current.drafts = current.current.drafts.map((row) => ({
              ...row,
              buyer: {
                ...row.buyer,
                buyer_name: row.buyer.buyer_name.trim() || "Guest",
              },
            }));
            setSaved(current.current);
            setReady(true);
          }
        })
        .catch(() =>
          onNotice(
            message(
              "could_not_load_held_orders_reload_before_you_enter_a_sale",
            ),
          ),
        );
    return () => {
      active = false;
    };
  }, [db, key]);
  const draft = ready
    ? saved?.drafts.find((row) => row.id === saved.active_id)
    : null;
  function save(next) {
    if (!ready || !key || locked.current) return;
    current.current = next;
    setSaved(next);
    setSaving(true);
    writes.current = writes.current
      .catch(() => {})
      .then(() => putMeta(db, key, next));
    const pending = writes.current;
    pending.then(
      () => {
        if (writes.current === pending) setSaving(false);
      },
      () => {
        if (writes.current === pending) setSaving(false);
        onNotice(
          message("draft_was_not_saved_keep_this_page_open_and_try_again"),
        );
      },
    );
  }
  function edit(values) {
    if (!ready) return;
    save({
      ...current.current,
      drafts: current.current.drafts.map((row) =>
        row.id === current.current.active_id ? { ...row, ...values } : row,
      ),
    });
  }
  function setCart(value) {
    const old =
      current.current?.drafts.find(
        (row) => row.id === current.current.active_id,
      )?.items || [];
    edit({ items: typeof value === "function" ? value(old) : value });
  }
  function start() {
    if (!ready) return;
    const row = newDraft();
    save({
      active_id: row.id,
      drafts: [
        ...current.current.drafts.filter(
          (item) =>
            item.items.length ||
            (item.buyer.buyer_name && item.buyer.buyer_name !== "Guest") ||
            item.buyer.buyer_phone ||
            item.buyer.buyer_email ||
            (item.payment_method_note && item.payment_method_note !== "cash"),
        ),
        row,
      ],
    });
  }
  function resume(id) {
    if (ready) save({ ...current.current, active_id: id });
  }
  function discard(id) {
    if (!confirm(t("discard_this_unfinished_order"))) return;
    const rows = current.current.drafts.filter((row) => row.id !== id);
    save(
      rows.length
        ? {
            active_id: rows.some((row) => row.id === current.current.active_id)
              ? current.current.active_id
              : rows[0].id,
            drafts: rows,
          }
        : newWorkspace(),
    );
  }
  async function complete(sale) {
    locked.current = true;
    try {
      await writes.current;
      const rows = current.current.drafts.filter(
        (row) => row.id !== current.current.active_id,
      );
      const next = rows.length
        ? { active_id: rows[0].id, drafts: rows }
        : newWorkspace();
      await saveSale(db, sale, key, next);
      current.current = next;
      setSaved(next);
    } finally {
      locked.current = false;
    }
  }
  return {
    ready,
    saving,
    cart: draft?.items || [],
    setCart,
    buyer: draft?.buyer || blankBuyer(),
    setBuyer: (buyer) => edit({ buyer }),
    taxOn: draft?.tax_on ?? true,
    setTaxOn: (tax_on) => edit({ tax_on }),
    paymentMethodNote: draft?.payment_method_note || "cash",
    setPaymentMethodNote: (payment_method_note) => edit({ payment_method_note }),
    drafts: ready ? saved.drafts : [],
    activeID: saved?.active_id,
    start,
    resume,
    discard,
    complete,
  };
}
