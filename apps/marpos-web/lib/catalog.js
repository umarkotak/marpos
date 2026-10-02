export const defaultCategories = ["makanan", "minuman", "lainnya"];

export function productCategories(products) {
  const custom = [
    ...new Set(
      products
        .map((product) => product.category)
        .filter(
          (category) => category && !defaultCategories.includes(category),
        ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return [...defaultCategories, ...custom];
}
