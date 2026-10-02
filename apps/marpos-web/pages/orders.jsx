import { OrdersPage } from "@/components/orders/order-history";
import { useRegister } from "@/components/register-provider";

export default function Page() {
  const { db, auth, pending, setNotice, printReceipt, products, syncSales } =
    useRegister();
  return (
    <OrdersPage
      db={db}
      auth={auth}
      pending={pending}
      onNotice={setNotice}
      onPrint={printReceipt}
      products={products}
      onSaved={() => syncSales(db, auth)}
    />
  );
}
