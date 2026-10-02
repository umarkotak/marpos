import { useEffect } from "react";
import { navigate } from "@/lib/navigation";
export default function Home() {
  useEffect(() => {
    const path = location.hash.startsWith("#reports/")
      ? "/" + location.hash.slice(1).replace("reports/overview", "reports")
      : "/pos" + location.search;
    navigate(path, true);
  }, []);
  return null;
}
