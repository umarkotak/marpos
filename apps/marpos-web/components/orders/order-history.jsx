import { t, message, useI18n, formatLocale } from "@/lib/i18n";
import { AuditHistory } from "@/components/audit/audit-history";
import { OrderEditor } from "@/components/orders/order-editor";
import { BuyerFields, blankBuyer, buyerError } from "@/components/buyer-fields";
import { saveSale } from "@/lib/local-db";
import { updateQuery, useQueryState } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { localSales } from "@/lib/local-db";

import { api } from "@/lib/api";
import { money } from "@/lib/reports";
export function OrdersPage({
  db,
  auth,
  pending,
  onNotice,
  onPrint,
  products = [],
  onSaved = () => {},
}) {
  useI18n();
  const [orders, setOrders] = useState([]);
  const [local, setLocal] = useState([]);
  const [recordStatus] = useQueryState("status");
  const trash = recordStatus === "deleted" && auth.is_superadmin;
  const [detail, setDetail] = useState(null);
  const [orderID, setOrderID] = useQueryState("order");
  const [more, setMore] = useState(false);
  const admin =
    auth.role === "owner" || auth.role === "admin" || auth.is_superadmin;
  const canEdit = auth.role === "owner" || auth.is_superadmin;
  const [editing, setEditing] = useState(false);
  const [repair, setRepair] = useState(null),
    [repairBuyer, setRepairBuyer] = useState(blankBuyer),
    [repairBusy, setRepairBusy] = useState(false);
  async function load() {
    try {
      const first = await api(
        `/stores/${auth.store_id}/sales?trash=${trash}&offset=0`,
      );
      setOrders(first);
      setMore(first.length === 50);
    } catch (error) {
      if (error.status !== 401)
        onNotice(
          message("order_history_is_unavailable_offline_local_sales_are_shown"),
        );
      setOrders([]);
      setMore(false);
    }
    if (db) setLocal(await localSales(db, auth.store_id));
  }
  async function loadMore() {
    try {
      const next = await api(
        `/stores/${auth.store_id}/sales?trash=${trash}&offset=${orders.length}`,
      );
      setOrders([...orders, ...next]);
      setMore(next.length === 50);
    } catch (error) {
      onNotice(error.message);
    }
  }
  useEffect(() => {
    load();
  }, [auth.store_id, trash, db, pending]);
  const remoteIDs = new Set(orders.map((order) => order.id));
  const shown = trash
    ? orders
    : [
        ...local
          .filter(
            (sale) => sale.sync_status === "pending" && !remoteIDs.has(sale.id),
          )
          .map((sale) => ({ ...sale, local: true })),
        ...orders,
      ].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  function open(order, edit = false) {
    setEditing(edit);
    setOrderID(order.id);
  }
  useEffect(() => {
    let active = true;
    setDetail(null);
    if (orderID) {
      const sale = local.find(
        (row) => row.id === orderID && row.sync_status === "pending",
      );
      if (sale) setDetail({ sale, items: sale.items });
      else
        api(`/stores/${auth.store_id}/sales/${orderID}`)
          .then((data) => {
            if (active) setDetail(data);
          })
          .catch((error) => {
            if (active) onNotice(error.message);
          });
    }
    return () => {
      active = false;
    };
  }, [orderID, auth.store_id, local]);
  function closeDetail() {
    setDetail(null);
    setOrderID(null);
    setEditing(false);
  }
  async function change(order, restore) {
    if (
      !restore &&
      !confirm(t("delete_order_confirmation", { reference: order.reference }))
    )
      return;
    try {
      await api(
        `/stores/${auth.store_id}/sales/${order.id}${restore ? "/restore" : ""}`,
        { method: restore ? "POST" : "DELETE" },
      );
      closeDetail();
      await load();
    } catch (error) {
      onNotice(error.message);
    }
  }
  async function saveCorrection(input) {
    await api(`/stores/${auth.store_id}/sales/${detail.sale.id}`, {
      method: "PUT",
      body: input,
    });
    setEditing(false);
    closeDetail();
    await load();
    onNotice(
      message("order_corrected_the_original_values_are_in_correction_history"),
    );
  }
  async function saveBuyer(event) {
    event.preventDefault();
    const error = buyerError(repairBuyer);
    if (error) {
      onNotice(error);
      return;
    }
    setRepairBusy(true);
    try {
      await saveSale(db, {
        ...repair,
        ...Object.fromEntries(
          Object.entries(repairBuyer).map(([key, value]) => [
            key,
            value.trim(),
          ]),
        ),
      });
      setRepair(null);
      await load();
      onNotice(message("buyer_details_saved_pending_sync_will_retry"));
      onSaved();
    } catch {
      onNotice(message("buyer_details_were_not_saved_try_again"));
    } finally {
      setRepairBusy(false);
    }
  }
  return (
    <section className="products-page">
      <div className="page-heading heading-row">
        <div>
          <small>{t("sales")}</small>
          <h1>{t("order_history")}</h1>
          <p>
            {t("recent_orders_for")} {auth.store_name}.
          </p>
        </div>
        {auth.is_superadmin && (
          <button
            className="button secondary"
            onClick={() => {
              setDetail(null);
              setEditing(false);
              updateQuery({ status: trash ? null : "deleted", order: null });
            }}
          >
            {trash ? t("active_orders") : t("deleted_orders")}
          </button>
        )}
      </div>
      <div className="table-card">
        <div className="table-head">
          <strong>{t("order_count", { count: shown.length })}</strong>
          <span>{t("most_recent_first")}</span>
        </div>
        <div className="orders-scroll">
          <table className="orders-table order-history-table">
            <thead>
              <tr>
                <th>{t("reference")}</th>
                <th>{t("buyer")}</th>
                <th>{t("date")}</th>
                <th>{t("cashier")}</th>
                <th>{t("total_label")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.reference || t("pending_sync")}</strong>
                    {order.local && (
                      <small>
                        {t("temporary_receipt")}{" "}
                        {order.receipt_number.slice(-8)}
                      </small>
                    )}
                  </td>
                  <td>
                    <strong>{order.buyer_name || "—"}</strong>
                    <small>{order.buyer_phone}</small>
                    <small>{order.buyer_email}</small>
                  </td>
                  <td>
                    {new Date(order.completed_at).toLocaleString(
                      formatLocale(),
                    )}
                  </td>
                  <td>
                    {order.local ? t("pending_sync") : order.cashier_name}
                  </td>
                  <td className="order-amount">{money(order.grand_total)}</td>
                  <td>
                    <div className="order-actions">
                      {(!trash || auth.is_superadmin) && (
                        <button
                          className="button secondary"
                          onClick={() => open(order)}
                        >
                          {t("view")}
                        </button>
                      )}
                      {!trash && canEdit && !order.local && (
                        <button
                          className="button secondary"
                          onClick={() => open(order, true)}
                        >
                          {t("edit_order")}
                        </button>
                      )}
                      {order.local &&
                        !order.buyer_name &&
                        !order.buyer_phone &&
                        !order.buyer_email &&
                        order.cashier_id === auth.user_id && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setRepairBuyer(blankBuyer());
                              setRepair(order);
                            }}
                          >
                            {t("add_buyer_details")}
                          </button>
                        )}
                      {(trash ? auth.is_superadmin : admin) && !order.local && (
                        <button
                          className="button secondary"
                          onClick={() => change(order, trash)}
                        >
                          {trash ? t("restore") : t("delete_order")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <div className="empty">
            <strong>{t("no_orders_found")}</strong>
          </div>
        )}
        {more && (
          <button className="button secondary" onClick={loadMore}>
            {t("load_more_orders")}
          </button>
        )}
      </div>
      {repair && (
        <div className="overlay">
          <form className="modal" onSubmit={saveBuyer}>
            <div className="modal-head">
              <h2>{t("add_buyer_details")}</h2>
            </div>
            <div className="modal-body">
              <BuyerFields
                buyer={repairBuyer}
                onChange={setRepairBuyer}
                disabled={repairBusy}
              />
            </div>
            <div className="modal-foot">
              <button
                className="button secondary"
                type="button"
                disabled={repairBusy}
                onClick={() => setRepair(null)}
              >
                {t("cancel")}
              </button>
              <button className="button primary" disabled={repairBusy}>
                {t("save_buyer_details")}
              </button>
            </div>
          </form>
        </div>
      )}
      {detail && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetail();
          }}
        >
          <section
            className="modal order-detail"
            role="dialog"
            aria-modal="true"
            aria-label={t("order_details")}
          >
            <div className="modal-head">
              <div>
                <small>{t("order_label")}</small>
                <h2>{detail.sale.reference || t("pending_sync")}</h2>
                <p>
                  {new Date(detail.sale.completed_at).toLocaleString(
                    formatLocale(),
                  )}
                </p>
              </div>
              <button className="icon-button" onClick={closeDetail}>
                {t("close")}
              </button>
            </div>
            {editing ? (
              <div className="modal-body">
                <OrderEditor
                  detail={detail}
                  products={products}
                  onSave={saveCorrection}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <div className="buyer-summary">
                    <strong>{detail.sale.buyer_name || t("buyer")}</strong>
                    <p>
                      {detail.sale.buyer_phone} {detail.sale.buyer_email}
                    </p>
                  </div>
                  {detail.items.map((item) => (
                    <div className="receipt-line" key={item.id}>
                      <span>
                        {item.quantity} × {item.product_name}
                        {item.addons?.map((addon) => (
                          <small key={addon.id || addon.option_name}>
                            + {addon.option_name}
                          </small>
                        ))}
                      </span>
                      <strong>{money(item.line_total)}</strong>
                    </div>
                  ))}
                  <div className="receipt-line">
                    <span>{t("subtotal")}</span>
                    <strong>{money(detail.sale.subtotal)}</strong>
                  </div>
                  <div className="receipt-line">
                    <span>
                      {t("tax_label")}{" "}
                      {detail.sale.tax_applied
                        ? `(${detail.sale.tax_percentage}%)`
                        : "excluded"}
                    </span>
                    <strong>{money(detail.sale.tax_total)}</strong>
                  </div>
                  <div className="receipt-line grand">
                    <span>{t("total_label")}</span>
                    <strong>{money(detail.sale.grand_total)}</strong>
                  </div>
                  <AuditHistory
                    entries={detail.history || []}
                    local={detail.sale.sync_status === "pending"}
                  />
                </div>
                <div className="modal-foot">
                  <button className="button secondary" onClick={closeDetail}>
                    {t("close")}
                  </button>
                  {canEdit &&
                    !detail.sale.sync_status &&
                    !detail.sale.deleted_at && (
                      <button
                        className="button secondary"
                        onClick={() => setEditing(true)}
                      >
                        {t("edit_order")}
                      </button>
                    )}
                  <button
                    className="button primary"
                    onClick={() => onPrint(detail)}
                  >
                    {t("print_receipt")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
