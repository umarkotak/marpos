import { FinancePage } from "@/components/finance/finance-page";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const { db, auth, pending, setNotice, setPending, syncSales } = useRegister();
  return (
    <FinancePage
      db={db}
      auth={auth}
      pending={pending}
      onNotice={setNotice}
      onSaved={() => {
        setPending((count) => count + 1);
        syncSales(db, auth);
      }}
    />
  );
}
