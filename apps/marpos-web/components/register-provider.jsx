import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import { navigate, pagePaths, useLocation } from "@/lib/navigation";
import { useOfflineShell } from "@/hooks/use-offline-shell";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { useOrderDrafts } from "@/hooks/use-order-drafts";
import {
  clearStoreRecords,
  getMeta,
  getProducts,
  openLocalDB,
  pendingSales,
  putMeta,
  replaceProducts,
  pendingFinance,
} from "@/lib/local-db";

const RegisterContext = createContext(null);
export const useRegister = () => useContext(RegisterContext);

export function RegisterProvider({ children }) {
  const [db, setDB] = useState(null);
  const [auth, setAuth] = useState(null);
  const [stores, setStores] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [products, setProducts] = useState([]);
  const { pathname } = useLocation();
  const tab =
    Object.keys(pagePaths).find(
      (key) =>
        pathname === pagePaths[key] ||
        pathname.startsWith(pagePaths[key] + "/"),
    ) || "pos";
  const setTab = (next) => navigate(pagePaths[next]);
  const [printDetail, setPrintDetail] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 10_000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [appConfig, setAppConfig] = useState(null);
  const [clearing, setClearing] = useState("");
  const draftOrders = useOrderDrafts(db, auth, setNotice);
  const [checkingOut, setCheckingOut] = useState(false);
  const clearingStore = useRef(false);
  useEffect(() => {
    if (auth && !auth.store_id && pathname !== "/stores")
      navigate("/stores", true);
  }, [auth, pathname]);
  const loadCatalog = useCallback(async (localDB, session) => {
    const catalog = await api(`/stores/${session.store_id}/products`);
    await replaceProducts(localDB, session.store_id, catalog);
    setProducts(catalog);
    setOnline(true);
  }, []);

  const prepareStore = useCallback(
    async (localDB, session, store, storeList) => {
      const deviceKey = `device_id:${store.id}`;
      const deviceID =
        (await getMeta(localDB, deviceKey)) ||
        (session.store_id === store.id ? session.device_id : null) ||
        crypto.randomUUID();
      await putMeta(localDB, deviceKey, deviceID);
      const saved = {
        ...session,
        ...store,
        store_id: store.id,
        store_name: store.name,
        register_id: store.register_id,
        tax_percentage: store.tax_percentage,
        role: store.role,
        device_id: deviceID,
        stores: storeList,
      };
      setAuth(saved);
      setProducts(await getProducts(localDB, store.id));
      setLastReceipt(null);
      await putMeta(localDB, "auth", saved);
      try {
        const device = await api(`/stores/${store.id}/device`, {
          method: "POST",
          body: { device_id: deviceID },
        });
        const onlineSession = {
          ...saved,
          offline_expires_at: device.offline_expires_at,
        };
        setAuth(onlineSession);
        await putMeta(localDB, "auth", onlineSession);
        await loadCatalog(localDB, onlineSession);
      } catch (error) {
        setOnline(false);
        if (error.status === 403) {
          const available = storeList.filter((item) => item.id !== store.id);
          const noStore = {
            user_id: session.user_id,
            name: session.name,
            email: session.email,
            device_id: deviceID,
            offline_expires_at: session.offline_expires_at,
            stores: available,
          };
          setStores(available);
          setAuth(noStore);
          await putMeta(localDB, "auth", noStore);
          setNotice("You no longer have access to this store.");
        }
      }
    },
    [loadCatalog],
  );

  const { syncSales, syncing } = useSyncQueue({
    clearingStore,
    setPending,
    setLastReceipt,
    setNotice,
    setOnline,
    setAuth,
  });

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const localDB = await openLocalDB();
        if (!active) return;
        setDB(localDB);
        const cached = await getMeta(localDB, "auth");
        if (
          cached &&
          new Date(cached.offline_expires_at).getTime() > Date.now()
        ) {
          setAuth(cached);
          setStores(cached.stores || []);
          if (cached.store_id)
            setProducts(await getProducts(localDB, cached.store_id));
          setPending(
            (await pendingSales(localDB)).length +
              (await pendingFinance(localDB)).length,
          );
          try {
            const session = await api("/auth/me");
            const available = await api("/stores");
            const invites = await api("/invitations");
            setStores(available);
            setInvitations(invites);
            const store =
              available.find((item) => item.id === cached.store_id) ||
              available[0];
            if (store) {
              await prepareStore(
                localDB,
                { ...session, device_id: cached.device_id },
                store,
                available,
              );
              syncSales(localDB, cached);
            } else {
              const saved = {
                ...session,
                device_id: cached.device_id,
                stores: [],
              };
              setAuth(saved);
              await putMeta(localDB, "auth", saved);
            }
          } catch (error) {
            setOnline(false);
            if (error.status === 401) {
              await putMeta(localDB, "auth", null);
              setAuth(null);
              setNotice("Sign in again to continue.");
            }
          }
        } else if (cached) {
          await putMeta(localDB, "auth", null);
          setNotice("Offline access expired. Sign in online again.");
        }
      } catch {
        setNotice(
          "This browser cannot save sales. Use a browser with IndexedDB.",
        );
      }
      try {
        const config = await api("/auth/config");
        if (active) setAppConfig(config);
      } catch {
        setOnline(false);
      }
    }
    start();
    return () => {
      active = false;
    };
  }, [prepareStore, syncSales]);
  useOfflineShell(pathname);

  const signIn = useCallback(
    async ({ credential }) => {
      try {
        let deviceID = await getMeta(db, "device_id");
        if (!deviceID) {
          deviceID = crypto.randomUUID();
          await putMeta(db, "device_id", deviceID);
        }
        const session = await api("/auth/google", {
          method: "POST",
          body: { credential, device_id: deviceID },
        });
        const available = await api("/stores");
        const invites = await api("/invitations");
        setStores(available);
        setInvitations(invites);
        const saved = { ...session, device_id: deviceID, stores: available };
        await putMeta(db, "auth", saved);
        if (available.length) {
          await prepareStore(db, saved, available[0], available);
          syncSales(db, saved);
        } else setAuth(saved);
        setNotice("");
      } catch (error) {
        setNotice(error.message);
      }
    },
    [db, prepareStore, syncSales],
  );

  useEffect(() => {
    if (!db || !auth?.store_id) return;
    const retry = () => {
      syncSales(db, auth);
      loadCatalog(db, auth).catch(() => setOnline(false));
    };
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 60_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [db, auth, syncSales, loadCatalog]);

  useEffect(() => {
    if (!auth || !db) return;
    const refresh = async () => {
      try {
        const [available, invites] = await Promise.all([
          api("/stores"),
          api("/invitations"),
        ]);
        setStores(available);
        setInvitations(invites);
        if (
          auth.store_id &&
          !available.some((store) => store.id === auth.store_id)
        ) {
          const noStore = {
            user_id: auth.user_id,
            name: auth.name,
            email: auth.email,
            device_id: auth.device_id,
            offline_expires_at: auth.offline_expires_at,
            stores: available,
          };
          setAuth(noStore);
          await putMeta(db, "auth", noStore);
          setProducts([]);
          setNotice("Your access to this store has ended.");
        }
      } catch {}
    };
    const timer = setInterval(refresh, 60_000);
    if (tab === "stores") refresh();
    return () => clearInterval(timer);
  }, [auth?.user_id, auth?.store_id, db, tab]);

  async function saveSettings(input) {
    try {
      const settings = await api(`/stores/${auth.store_id}/settings`, {
        method: "PUT",
        body: input,
      });
      const updatedStores = stores.map((store) =>
        store.id === auth.store_id ? { ...store, ...settings } : store,
      );
      const saved = {
        ...auth,
        ...settings,
        store_name: settings.name,
        stores: updatedStores,
      };
      await putMeta(db, "auth", saved);
      setStores(updatedStores);
      setAuth(saved);
      setNotice("Store settings saved.");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function clearStore(kind) {
    if (
      clearingStore.current ||
      draftOrders.saving ||
      checkingOut ||
      syncing.current
    ) {
      setNotice("Wait for current saves and sync to finish.");
      return;
    }
    const label =
      kind === "products" ? "all products and orders" : "all orders";
    const confirmation = window.prompt(
      `Permanently delete ${label} from ${auth.store_name}? Type the store name to confirm.`,
    );
    if (confirmation === null) return;
    if (confirmation !== auth.store_name) {
      setNotice("The store name did not match.");
      return;
    }
    clearingStore.current = true;
    setClearing(kind);
    try {
      await api(`/stores/${auth.store_id}/${kind}`, {
        method: "DELETE",
        body: { confirm_store_name: confirmation },
      });
      await clearStoreRecords(db, auth.store_id, kind === "products");
      if (kind === "products" && "caches" in window) {
        try {
          const images = await caches.open("marpos-images-v1");
          const keys = await images.keys();
          await Promise.all(
            keys
              .filter((request) =>
                new URL(request.url).pathname.startsWith(
                  `/backend/images/${auth.store_id}/`,
                ),
              )
              .map((request) => images.delete(request)),
          );
        } catch {}
      }
      window.location.reload();
    } catch (error) {
      setNotice(error.message);
    } finally {
      clearingStore.current = false;
      setClearing("");
    }
  }
  async function createStore(input) {
    try {
      const store = await api("/stores", { method: "POST", body: input });
      const available = [...stores, store];
      setStores(available);
      await prepareStore(db, auth, store, available);
      setTab("pos");
      setNotice("Store created.");
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    }
  }
  async function selectStore(store) {
    if (draftOrders.saving) {
      setNotice("Wait for the draft to save before you switch stores.");
      return;
    }
    await prepareStore(db, auth, store, stores);
    setTab("pos");
  }
  async function decideInvitation(id, accept) {
    try {
      await api(`/invitations/${id}/decision`, {
        method: "POST",
        body: { accept },
      });
      const [available, invites] = await Promise.all([
        api("/stores"),
        api("/invitations"),
      ]);
      setStores(available);
      setInvitations(invites);
      setNotice(
        accept ? "Store invitation accepted." : "Store invitation rejected.",
      );
    } catch (error) {
      setNotice(error.message);
    }
  }
  function printReceipt(detail) {
    setPrintDetail(detail);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await putMeta(db, "auth", null);
    setAuth(null);
    setStores([]);
    setInvitations([]);
    setProducts([]);
  }

  return (
    <RegisterContext.Provider
      value={{
        db,
        auth,
        stores,
        invitations,
        products,
        tab,
        pathname,
        setTab,
        printDetail,
        printReceipt,
        lastReceipt,
        setLastReceipt,
        pending,
        setPending,
        online,
        notice,
        setNotice,
        appConfig,
        signIn,
        clearing,
        checkingOut,
        setCheckingOut,
        draftOrders,
        loadCatalog,
        syncSales,
        saveSettings,
        clearStore,
        createStore,
        selectStore,
        decideInvitation,
        logout,
      }}
    >
      {children}
    </RegisterContext.Provider>
  );
}
