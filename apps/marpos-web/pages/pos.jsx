import { AddonDialog } from "@/components/pos/addon-dialog";
import { BuyerDialog } from "@/components/pos/buyer-dialog";
import { SalePreview } from "@/components/pos/sale-preview";
import { Cart } from "@/components/pos/cart";
import { Catalog } from "@/components/pos/catalog";
import { useRef, useState } from "react";
import { useRegister } from "@/components/register-provider";
import { buyerError } from "@/components/buyer-fields";
import { productCategories } from "@/lib/catalog";
import { useQueryState } from "@/lib/navigation";

export default function PosPage() {
  const {
    db,
    auth,
    products,
    draftOrders,
    checkingOut,
    setCheckingOut,
    setLastReceipt,
    setPending,
    setNotice,
    syncSales,
  } = useRegister();
  const [search, setSearch] = useQueryState("q");
  const [selected, setSelected] = useState(null);
  const [choices, setChoices] = useState({});
  const { cart, setCart, buyer, setBuyer, taxOn } = draftOrders;
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [buyerDraft, setBuyerDraft] = useState({
    buyer_name: "",
    buyer_phone: "",
    buyer_email: "",
  });
  const [mobilePanel, setMobilePanel] = useState("catalog");
  const checkoutLock = useRef(false);
  const categories = productCategories(products);
  const filtered = products.filter((product) =>
    `${product.name} ${product.sku}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const productsByCategory = new Map();
  for (const product of filtered) {
    const category = product.category || "lainnya";
    if (!productsByCategory.has(category)) productsByCategory.set(category, []);
    productsByCategory.get(category).push(product);
  }
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const tax =
    taxOn && auth ? Math.round((subtotal * auth.tax_percentage) / 100) : 0;
  const total = subtotal + tax;

  function addLine(product, addons) {
    const costs = [
      ...(product.cost_breakdown || []),
      ...addons
        .filter((addon) => addon.cost_delta > 0)
        .map((addon) => ({
          name: `${addon.group_name}: ${addon.option_name}`,
          amount: addon.cost_delta,
        })),
    ];
    const configured = product.cost_configured === true;
    setCart((old) => [
      ...old,
      {
        cost_breakdown: configured ? costs : [],
        cost_configured: configured,
        unit_cost: configured
          ? costs.reduce((sum, cost) => sum + cost.amount, 0)
          : 0,
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        line_total:
          product.price +
          addons.reduce((sum, addon) => sum + addon.price_delta, 0),
        addons,
      },
    ]);
    setSelected(null);
  }
  function chooseProduct(product) {
    if (!draftOrders.ready || checkingOut) return;
    if (product.addon_groups.length) {
      setSelected(product);
      setChoices({});
    } else addLine(product, []);
  }
  function confirmChoices() {
    for (const group of selected.addon_groups)
      if (group.required && !(choices[group.id] || []).length) {
        setNotice(`Choose an option in ${group.name}.`);
        return;
      }
    const addons = selected.addon_groups.flatMap((group) =>
      (choices[group.id] || []).map((id) => {
        const option = group.options.find((entry) => entry.id === id);
        return {
          id: crypto.randomUUID(),
          option_id: option.id,
          group_name: group.name,
          option_name: option.name,
          price_delta: option.price_delta,
          cost_delta: option.cost_delta || 0,
        };
      }),
    );
    addLine(selected, addons);
    setNotice("");
  }
  function changeQuantity(id, delta) {
    if (checkingOut) return;
    setCart((old) =>
      old.map((item) => {
        if (item.id !== id) return item;
        const quantity = Math.max(1, Math.min(1000, item.quantity + delta));
        return {
          ...item,
          quantity,
          line_total:
            quantity *
            (item.unit_price +
              item.addons.reduce((sum, addon) => sum + addon.price_delta, 0)),
        };
      }),
    );
  }
  function openCheckoutPreview() {
    const error = buyerError(buyer);
    if (error) {
      setNotice(error);
      openBuyer();
      return;
    }
    setPreviewOpen(true);
  }
  async function checkout() {
    if (
      !db ||
      !auth ||
      !cart.length ||
      !draftOrders.ready ||
      checkoutLock.current
    )
      return;
    const error = buyerError(buyer);
    if (error) {
      setPreviewOpen(false);
      setNotice(error);
      openBuyer();
      return;
    }
    if (new Date(auth.offline_expires_at).getTime() <= Date.now()) {
      setNotice("Offline access expired. Sign in online before checkout.");
      return;
    }
    checkoutLock.current = true;
    setCheckingOut(true);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const sale = {
      operation_id: crypto.randomUUID(),
      device_id: auth.device_id,
      id,
      store_id: auth.store_id,
      register_id: auth.register_id,
      cashier_id: auth.user_id,
      receipt_number: `${auth.register_id.slice(0, 8)}-${id}`,
      created_at: now,
      completed_at: now,
      tax_applied: taxOn,
      tax_percentage: auth.tax_percentage,
      subtotal,
      tax_total: tax,
      grand_total: total,
      ...Object.fromEntries(
        Object.entries(buyer).map(([key, value]) => [key, value.trim()]),
      ),
      items: cart,
    };
    try {
      await draftOrders.complete(sale);
      setPreviewOpen(false);
      setLastReceipt({ sale, items: cart });
      setPending((count) => count + 1);
      setNotice(
        `Sale saved. Temporary receipt ${sale.receipt_number.slice(-8)}.`,
      );
      syncSales(db, auth);
    } catch {
      setNotice("Sale was not saved. Keep the cart and try again.");
    } finally {
      checkoutLock.current = false;
      setCheckingOut(false);
    }
  }
  function openBuyer() {
    setBuyerDraft({ ...buyer });
    setBuyerOpen(true);
  }
  function saveBuyer(event) {
    event.preventDefault();
    const error = buyerError(buyerDraft);
    if (error) {
      setNotice(error);
      return;
    }
    setBuyer(
      Object.fromEntries(
        Object.entries(buyerDraft).map(([key, value]) => [key, value.trim()]),
      ),
    );
    setBuyerOpen(false);
    setNotice("");
  }
  return (
    <>
      <div className={`pos-layout show-${mobilePanel}`}>
        <div
          className="pos-mobile-switch"
          role="group"
          aria-label="Point of sale view"
        >
          <button
            className={mobilePanel === "catalog" ? "active" : ""}
            onClick={() => setMobilePanel("catalog")}
          >
            Products
          </button>
          <button
            className={mobilePanel === "order" ? "active" : ""}
            onClick={() => setMobilePanel("order")}
          >
            Current order · {cart.length}
          </button>
        </div>
        <Catalog
          categories={categories}
          productsByCategory={productsByCategory}
          chooseProduct={chooseProduct}
          search={search}
          setSearch={setSearch}
          filtered={filtered}
        />
        <Cart
          subtotal={subtotal}
          tax={tax}
          total={total}
          changeQuantity={changeQuantity}
          openBuyer={openBuyer}
          openCheckoutPreview={openCheckoutPreview}
          setBuyerOpen={setBuyerOpen}
          setMobilePanel={setMobilePanel}
        />
      </div>
      <SalePreview
        previewOpen={previewOpen}
        setPreviewOpen={setPreviewOpen}
        subtotal={subtotal}
        tax={tax}
        total={total}
        checkout={checkout}
      />
      <BuyerDialog
        buyerOpen={buyerOpen}
        setBuyerOpen={setBuyerOpen}
        buyerDraft={buyerDraft}
        setBuyerDraft={setBuyerDraft}
        saveBuyer={saveBuyer}
      />
      <AddonDialog
        selected={selected}
        setSelected={setSelected}
        choices={choices}
        setChoices={setChoices}
        confirmChoices={confirmChoices}
      />
    </>
  );
}
