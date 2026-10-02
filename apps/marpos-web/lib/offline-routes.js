import { pagePaths } from "./navigation";

// Cache dynamic page bundles. The worker sets route params on fallback.
export const offlineRoutes = [
  "/",
  ...Object.values(pagePaths),
  "/products/new",
  "/products/deleted",
  "/products/offline/edit",
  "/reports/comparison",
  "/reports/day/2000-01-01",
];
