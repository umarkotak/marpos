import { LoginScreen } from "@/components/auth/login-screen";
import Head from "next/head";
import { CloudUpload, LogOut, X } from "lucide-react";
import { useRegister } from "@/components/register-provider";
import { RegisterSidebar } from "./register-sidebar";
import { StoreManagement } from "@/components/stores/store-management";
import { PrintReceipt } from "@/components/orders/print-receipt";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
export function RegisterLayout({ children }) {
  const {
    auth,
    stores,
    invitations,
    tab,
    pathname,
    setTab,
    selectStore,
    online,
    pending,
    logout,
    notice,
    setNotice,
    createStore,
    decideInvitation,
    printDetail,
  } = useRegister();
  const productID = /^\/products\/[^/]+\/edit$/.test(pathname);
  const productTrash = pathname === "/products/deleted";
  const restricted =
    ["finance", "reports", "settings", "audit"].includes(tab) &&
    auth?.role === "cashier" &&
    !auth?.is_superadmin;
  return (
    <>
      <Head>
        <title>Marpos · Point of Sale</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Marpos keeps store sales available offline."
        />
        <meta name="theme-color" content="#0d8061" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
      </Head>
      {!auth ? (
        <LoginScreen />
      ) : !auth.store_id ? (
        <StoreManagement
          stores={stores}
          invitations={invitations}
          onCreate={createStore}
          onSelect={selectStore}
          onDecide={decideInvitation}
          onLogout={logout}
          notice={notice}
        />
      ) : (
        <SidebarProvider
          className={tab === "pos" ? "app-shell pos-screen" : "app-shell"}
        >
          <RegisterSidebar
            auth={auth}
            stores={stores}
            invitations={invitations}
            tab={tab}
            setTab={setTab}
            onStore={selectStore}
          />
          <SidebarInset className="app-main">
            <header className="topbar">
              <div className="topbar-left">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-5" />
                <div className="topbar-title">
                  <strong>
                    {pathname === "/products/new"
                      ? "New product"
                      : productID
                        ? "Edit product"
                        : productTrash
                          ? "Deleted products"
                          : {
                              pos: "Point of sale",
                              products: "Products",
                              orders: "Order history",
                              team: "Team",
                              settings: "Store settings",
                              stores: "Manage stores",
                              finance: "Income and expenses",
                              reports: "Reports",
                              audit: "Audit log",
                            }[tab]}
                  </strong>
                  <small>{auth.store_name}</small>
                </div>
              </div>
              <div className="topbar-right">
                <span
                  className={online ? "signal online" : "signal"}
                  aria-label={online ? "Connected" : "Offline"}
                  title={online ? "Connected" : "Offline"}
                >
                  <span className="dot" />
                  <span className="signal-label">
                    {online ? "Connected" : "Offline"}
                  </span>
                </span>
                <span
                  className="pending"
                  aria-label={`${pending} pending sync`}
                  title={`${pending} pending sync`}
                >
                  <CloudUpload size={16} />
                  <span className="pending-label">{pending} pending</span>
                  <span className="pending-count">{pending}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                  <span className="sign-out-label">Sign out</span>
                </Button>
              </div>
            </header>
            {restricted ? (
              <section className="products-page">
                <h1>Access restricted</h1>
                <p>Your store role cannot open this page.</p>
              </section>
            ) : (
              children
            )}
          </SidebarInset>
          <PrintReceipt detail={printDetail} storeName={auth.store_name} />
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Close notice">
                <X size={16} />
              </button>
            </div>
          )}
        </SidebarProvider>
      )}
    </>
  );
}
