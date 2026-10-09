import { message } from "@/lib/i18n";
import { useCallback, useRef } from "react";
import { api } from "@/lib/api";
import {
  pendingSales,
  pendingFinance,
  markSaleSynced,
  markFinanceSynced,
  putMeta,
} from "@/lib/local-db";
export function useSyncQueue({
  clearingStore,
  setPending,
  setLastReceipt,
  setNotice,
  setOnline,
  setAuth,
}) {
  const syncing = useRef(false);
  const syncSales = useCallback(async (localDB, session) => {
    if (!localDB || !session || syncing.current || clearingStore.current)
      return;
    syncing.current = true;
    try {
      const queued = await pendingSales(localDB);
      const entries = await pendingFinance(localDB);
      setPending(queued.length + entries.length);
      let failed = 0;
      for (const sale of queued) {
        try {
          const result = await api(`/stores/${sale.store_id}/sales`, {
            method: "POST",
            body: sale,
          });
          await markSaleSynced(localDB, sale, result);
          setLastReceipt((old) =>
            old?.sale.id === sale.id
              ? {
                  ...old,
                  sale: {
                    ...old.sale,
                    order_number: result.order_number,
                    reference: result.reference,
                  },
                }
              : old,
          );
          setPending((count) => count - 1);
        } catch (error) {
          if (!error.status || error.status === 401 || error.status >= 500)
            throw error;
          failed++;
        }
      }
      for (const entry of entries.filter(
        (entry) => entry.created_by === session.user_id,
      )) {
        try {
          await api(`/stores/${entry.store_id}/finance`, {
            method: "POST",
            body: entry,
          });
          await markFinanceSynced(localDB, entry);
          setPending((count) => count - 1);
        } catch (error) {
          if (!error.status || error.status === 401 || error.status >= 500)
            throw error;
          failed++;
        }
      }
      if (failed) setNotice(message("sync_failed_count", { count: failed }));
      else if (entries.some((entry) => entry.created_by !== session.user_id))
        setNotice(
          message(
            "some_pending_financial_records_need_the_user_who_created_them_to_sign_in",
          ),
        );
      setOnline(true);
    } catch (error) {
      setOnline(false);
      if (error.status && error.status !== 401)
        setNotice(
          message("sync_failed", {
            error: message("api_error", { detail: error.message }),
          }),
        );
      if (error.status === 401) {
        await putMeta(localDB, "auth", null);
        setAuth(null);
        setNotice(message("sign_in_again_to_sync_pending_sales"));
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  return { syncSales, syncing };
}
