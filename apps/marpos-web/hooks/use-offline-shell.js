import { useEffect } from "react";
import { offlineRoutes } from "@/lib/offline-routes";
export function useOfflineShell(pathname) {
  useEffect(() => {
    let prepareShell;
    if ("serviceWorker" in navigator) {
      prepareShell = () => {
        const urls = [
          ...offlineRoutes,
          ...Array.from(
            document.querySelectorAll(
              "script[src],link[rel=stylesheet],link[rel=preload]",
            ),
            (element) => element.src || element.href,
          ),
        ].filter(
          (url) => new URL(url, location.origin).origin === location.origin,
        );
        navigator.serviceWorker.controller?.postMessage({
          type: "CACHE_SHELL",
          urls,
        });
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        prepareShell,
      );
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(prepareShell)
        .catch(() => {});
      window.addEventListener("online", prepareShell);
    }
    return () => {
      if (prepareShell) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          prepareShell,
        );
        window.removeEventListener("online", prepareShell);
      }
    };
  }, []);

  useEffect(() => {
    const prepare = () =>
      navigator.serviceWorker?.controller?.postMessage({
        type: "CACHE_SHELL",
        urls: [
          pathname,
          ...Array.from(
            document.querySelectorAll("script[src],link[rel=stylesheet]"),
            (element) => element.src || element.href,
          ),
        ],
      });
    prepare();
  }, [pathname]);
}
