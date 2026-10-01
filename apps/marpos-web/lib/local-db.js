const databaseName = "marpos-pos";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openLocalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
        db.createObjectStore("products", { keyPath: "id" });
        db.createObjectStore("sales", { keyPath: "id" });
        db.createObjectStore("outbox", { keyPath: "operation_id" });
      }
      db.createObjectStore("finance", { keyPath: "id" });
      db.createObjectStore("finance_outbox", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => reject(new Error("Close other Marpos tabs, then reload."));
    request.onerror = () => reject(request.error);
  });
}

export async function getMeta(db, key) {
  return requestResult(db.transaction("meta").objectStore("meta").get(key));
}

export async function putMeta(db, key, value) {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  return transactionDone(tx);
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getProducts(db, storeID) {
  const products = await requestResult(db.transaction("products").objectStore("products").getAll());
  return products.filter((product) => product.store_id === storeID);
}

export async function replaceProducts(db, storeID, products) {
  const old = await requestResult(db.transaction("products").objectStore("products").getAll());
  const tx = db.transaction("products", "readwrite");
  const store = tx.objectStore("products");
  old.filter((product) => product.store_id === storeID).forEach((product) => store.delete(product.id));
  products.forEach((product) => store.put({ ...product, store_id: storeID }));
  await transactionDone(tx);
}

export async function clearStoreRecords(db, storeID, includeProducts) {
  const tx = db.transaction(["sales", "outbox", "products", "meta"], "readwrite");
  const done = transactionDone(tx);
  const sales = tx.objectStore("sales"), outbox = tx.objectStore("outbox"), products = tx.objectStore("products"), meta = tx.objectStore("meta");
  const [savedSales, pending, savedProducts, keys] = await Promise.all([
    requestResult(sales.getAll()), requestResult(outbox.getAll()), requestResult(products.getAll()), requestResult(meta.getAllKeys()),
  ]);
  savedSales.filter((row) => row.store_id === storeID).forEach((row) => sales.delete(row.id));
  pending.filter((row) => row.store_id === storeID).forEach((row) => outbox.delete(row.operation_id));
  if (includeProducts) savedProducts.filter((row) => row.store_id === storeID).forEach((row) => products.delete(row.id));
  keys.filter((key) => typeof key === "string" && (key.startsWith(`report:${storeID}:`) || key.startsWith(`audit:${storeID}:`) || key.startsWith("drafts:") && key.endsWith(`:${storeID}`))).forEach((key) => meta.delete(key));
  await done;
}

export async function saveSale(db, sale, draftKey, workspace) {
  const tx = db.transaction(draftKey?["sales", "outbox", "meta"]:["sales", "outbox"], "readwrite");
  tx.objectStore("sales").put({ ...sale, sync_status: "pending" });
  tx.objectStore("outbox").put(sale);
  if(draftKey)tx.objectStore("meta").put(workspace,draftKey);
  await transactionDone(tx);
}

export async function pendingSales(db) {
  const sales = await requestResult(db.transaction("outbox").objectStore("outbox").getAll());
  return sales.sort((a,b) => a.completed_at.localeCompare(b.completed_at) || a.id.localeCompare(b.id));
}

export async function localSales(db, storeID) {
  const sales = await requestResult(db.transaction("sales").objectStore("sales").getAll());
  return sales.filter((sale) => sale.store_id === storeID).sort((a,b) => b.completed_at.localeCompare(a.completed_at));
}

export async function markSaleSynced(db, sale, result) {
  const tx = db.transaction(["sales", "outbox"], "readwrite");
  tx.objectStore("sales").put({ ...sale, order_number: result.order_number, reference: result.reference, synced_at: new Date().toISOString(), sync_status: "synced" });
  tx.objectStore("outbox").delete(sale.operation_id);
  await transactionDone(tx);
}

export async function saveFinance(db, entry) {
  const tx = db.transaction(["finance", "finance_outbox"], "readwrite");
  tx.objectStore("finance").put({ ...entry, sync_status: "pending" });
  tx.objectStore("finance_outbox").put(entry);
  await transactionDone(tx);
}

export async function pendingFinance(db) {
  return requestResult(db.transaction("finance_outbox").objectStore("finance_outbox").getAll());
}

export async function localFinance(db, storeID) {
  const entries = await requestResult(db.transaction("finance").objectStore("finance").getAll());
  return entries.filter((entry) => entry.store_id === storeID);
}

export async function markFinanceSynced(db, entry) {
  const tx = db.transaction(["finance", "finance_outbox"], "readwrite");
  tx.objectStore("finance").put({ ...entry, synced_at: new Date().toISOString(), sync_status: "synced" });
  tx.objectStore("finance_outbox").delete(entry.id);
  await transactionDone(tx);
}
