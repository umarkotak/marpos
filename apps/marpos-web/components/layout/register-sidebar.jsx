import { t, useI18n, formatLocale, roleLabel } from "@/lib/i18n";
import {
  BarChart3,
  Wallet,
  Building2,
  ChevronDown,
  History,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { pagePaths } from "@/lib/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
export function RegisterSidebar({
  auth,
  stores,
  invitations,
  tab,
  setTab,
  onStore,
}) {
  useI18n();
  const { setOpenMobile } = useSidebar();
  const viewer = auth.role === "viewer";
  function navigate(nextTab, event) {
    if (
      event &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    )
      return;
    event?.preventDefault();
    setTab(nextTab);
    setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="store-switch-button"
                aria-label={t("choose_current_store", {
                  store: auth.store_name,
                })}
                title={t("choose_store")}
              />
            }
          >
            <span className="logo small">M</span>
            <span className="store-switch-name">
              <strong>{auth.store_name}</strong>
              <small>{roleLabel(auth.role)}</small>
            </span>
            <ChevronDown className="store-switch-arrow" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56">
            {stores.map((store) => (
              <DropdownMenuItem key={store.id} onClick={() => onStore(store)}>
                {store.name}
                {store.id === auth.store_id ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<a href={pagePaths.stores} />}
              onClick={(event) => navigate("stores", event)}
            >
              {t("manage_stores")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("store")}</SidebarGroupLabel>
          <SidebarMenu>
            {!viewer && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "pos"}
                  tooltip={t("point_of_sale")}
                  render={<a href={pagePaths.pos} />}
                  onClick={(event) => navigate("pos", event)}
                >
                  <ShoppingCart /> <span>{t("point_of_sale")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "products"}
                tooltip={t("products")}
                render={<a href={pagePaths.products} />}
                onClick={(event) => navigate("products", event)}
              >
                <Package /> <span>{t("products")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "orders"}
                tooltip={t("order_history")}
                render={<a href={pagePaths.orders} />}
                onClick={(event) => navigate("orders", event)}
              >
                <History /> <span>{t("order_history")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(auth.role !== "cashier" || auth.is_superadmin) && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "finance"}
                    tooltip={t("income_and_expenses")}
                    render={<a href={pagePaths.finance} />}
                    onClick={(event) => navigate("finance", event)}
                  >
                    <Wallet />
                    <span>{t("income_and_expenses")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "reports"}
                    tooltip={t("reports")}
                    render={<a href={pagePaths.reports} />}
                    onClick={(event) => navigate("reports", event)}
                  >
                    <BarChart3 />
                    <span>{t("reports")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
            {(auth.role !== "cashier" || auth.is_superadmin) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "audit"}
                  tooltip={t("audit_log")}
                  render={<a href={pagePaths.audit} />}
                  onClick={(event) => navigate("audit", event)}
                >
                  <History />
                  <span>{t("audit_log")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {!viewer && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "team"}
                  tooltip={t("team")}
                  render={<a href={pagePaths.team} />}
                  onClick={(event) => navigate("team", event)}
                >
                  <Users /> <span>{t("team")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {!viewer && (auth.role !== "cashier" || auth.is_superadmin) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "settings"}
                  tooltip={t("store_settings")}
                  render={<a href={pagePaths.settings} />}
                  onClick={(event) => navigate("settings", event)}
                >
                  <Settings /> <span>{t("store_settings")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "stores"}
                tooltip={t("manage_stores")}
                render={<a href={pagePaths.stores} />}
                onClick={(event) => navigate("stores", event)}
              >
                <Building2 />{" "}
                <span>
                  {t("manage_stores")}
                  {invitations.length ? ` (${invitations.length})` : ""}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="register-details group-data-[collapsible=icon]:hidden">
          <strong>
            {t("register")} {auth.register_id.slice(0, 8)}
          </strong>
          <small>
            {t("offline_until")}{" "}
            {new Date(auth.offline_expires_at).toLocaleDateString(
              formatLocale(),
            )}
          </small>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
