import { AuditLogPage } from "@/components/audit/audit-log";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const { db, auth } = useRegister();
  return <AuditLogPage db={db} auth={auth} />;
}
