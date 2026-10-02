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
  const { setOpenMobile } = useSidebar();
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
                aria-label={`Choose store. Current store: ${auth.store_name}`}
                title="Choose store"
              />
            }
          >
            <span className="logo small">M</span>
            <span className="store-switch-name">
              <strong>{auth.store_name}</strong>
              <small>{auth.role}</small>
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
              Manage stores
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Store</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "pos"}
                tooltip="Point of sale"
                render={<a href={pagePaths.pos} />}
                onClick={(event) => navigate("pos", event)}
              >
                <ShoppingCart /> <span>Point of sale</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "products"}
                tooltip="Products"
                render={<a href={pagePaths.products} />}
                onClick={(event) => navigate("products", event)}
              >
                <Package /> <span>Products</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "orders"}
                tooltip="Order history"
                render={<a href={pagePaths.orders} />}
                onClick={(event) => navigate("orders", event)}
              >
                <History /> <span>Order history</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(auth.role !== "cashier" || auth.is_superadmin) && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "finance"}
                    tooltip="Income and expenses"
                    render={<a href={pagePaths.finance} />}
                    onClick={(event) => navigate("finance", event)}
                  >
                    <Wallet />
                    <span>Income and expenses</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={tab === "reports"}
                    tooltip="Reports"
                    render={<a href={pagePaths.reports} />}
                    onClick={(event) => navigate("reports", event)}
                  >
                    <BarChart3 />
                    <span>Reports</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
            {(auth.role !== "cashier" || auth.is_superadmin) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "audit"}
                  tooltip="Audit log"
                  render={<a href={pagePaths.audit} />}
                  onClick={(event) => navigate("audit", event)}
                >
                  <History />
                  <span>Audit log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "team"}
                tooltip="Team"
                render={<a href={pagePaths.team} />}
                onClick={(event) => navigate("team", event)}
              >
                <Users /> <span>Team</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(auth.role !== "cashier" || auth.is_superadmin) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={tab === "settings"}
                  tooltip="Store settings"
                  render={<a href={pagePaths.settings} />}
                  onClick={(event) => navigate("settings", event)}
                >
                  <Settings /> <span>Store settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={tab === "stores"}
                tooltip="Manage stores"
                render={<a href={pagePaths.stores} />}
                onClick={(event) => navigate("stores", event)}
              >
                <Building2 />{" "}
                <span>
                  Manage stores
                  {invitations.length ? ` (${invitations.length})` : ""}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="register-details group-data-[collapsible=icon]:hidden">
          <strong>Register {auth.register_id.slice(0, 8)}</strong>
          <small>
            Offline until{" "}
            {new Date(auth.offline_expires_at).toLocaleDateString("en-GB")}
          </small>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
