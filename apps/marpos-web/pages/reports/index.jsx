import { ReportsPage } from "@/components/reports/reports-page";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const { db, auth, pending } = useRegister();
  return <ReportsPage db={db} auth={auth} pending={pending} />;
}
