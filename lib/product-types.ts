export const PRODUCT_TYPES = [
  "Agricole",
  "Halieutiques",
  "Locaux",
  "Élevage",
  "Ferrailles",
  "Forestier",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}
