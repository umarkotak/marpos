import Router, { useRouter } from "next/router";
export const pagePaths = {
  pos: "/pos",
  products: "/products",
  orders: "/orders",
  finance: "/finance",
  reports: "/reports",
  audit: "/audit-log",
  team: "/team",
  settings: "/settings",
  stores: "/stores",
};
export function navigate(path, replace = false) {
  return Router[replace ? "replace" : "push"](path);
}
export function useLocation() {
  const router = useRouter();
  const url = new URL(
    router.isReady ? router.asPath : router.pathname,
    "http://local",
  );
  return { pathname: url.pathname, query: url.searchParams };
}
export function updateQuery(
  values,
  replace = true,
  path = window.location.pathname,
) {
  const query = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) query.delete(key);
    else query.set(key, String(value));
  }
  return Router[replace ? "replace" : "push"](
    path + (query.size ? `?${query}` : ""),
    undefined,
    { shallow: path === window.location.pathname, scroll: false },
  );
}
export function useQueryState(key, fallback = "") {
  const { query } = useLocation();
  return [query.get(key) ?? fallback, (value) => updateQuery({ [key]: value })];
}
