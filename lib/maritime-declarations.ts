import Decimal from "decimal.js";

const ExactDecimal = Decimal.clone({ precision: 80 });

export type MaritimeProductInput = {
  id?: string;
  productId?: string;
  productType?: string;
  quantity: string;
  unitPrice?: string;
};

export type MaritimeDeclarationInput = {
  companyName: string;
  boatName: string;
  boatRegistration: string;
  boatCapacity: string;
  captainName: string;
  captainPhone: string | null;
  captainEmail: string | null;
  originDepartureDate: string;
  arrivalDate: string;
  departureDate: string | null;
  products: MaritimeProductInput[];
};

export type MaritimeDeclarationRecord = {
  id: string;
  maritimeUserId: string;
  companyName: string;
  boatName: string;
  boatRegistration: string;
  boatCapacity: { toString(): string };
  captainName: string;
  captainPhone: string | null;
  captainEmail: string | null;
  originDepartureDate: Date;
  arrivalDate: Date;
  departureDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  products: Array<{
    id: string;
    productType: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export class MaritimeDeclarationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaritimeDeclarationValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  data: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): string {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  if (!value) throw new MaritimeDeclarationValidationError(`${label} est obligatoire.`);
  if (value.length > maxLength) {
    throw new MaritimeDeclarationValidationError(`${label} dépasse la longueur autorisée.`);
  }
  return value;
}

function optionalText(
  data: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): string | null {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  if (value.length > maxLength) {
    throw new MaritimeDeclarationValidationError(`${label} dépasse la longueur autorisée.`);
  }
  return value || null;
}

function decimalText(
  value: unknown,
  label: string,
  precision: number,
  scale: number,
  allowZero: boolean,
): string {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new MaritimeDeclarationValidationError(`${label} doit être un nombre positif valide.`);
  }
  const [whole, fraction = ""] = value.split(".");
  if (whole.length > precision - scale || fraction.length > scale) {
    throw new MaritimeDeclarationValidationError(`${label} comporte trop de chiffres.`);
  }
  const number = new ExactDecimal(value);
  if (allowZero ? number.isNegative() : !number.gt(0)) {
    throw new MaritimeDeclarationValidationError(
      allowZero ? `${label} ne peut pas être négatif.` : `${label} doit être supérieur à zéro.`,
    );
  }
  return number.toFixed(scale);
}

function isoDate(data: Record<string, unknown>, key: string, label: string): string;
function isoDate(data: Record<string, unknown>, key: string, label: string, optional: true): string | null;
function isoDate(data: Record<string, unknown>, key: string, label: string, optional = false): string | null {
  const value = typeof data[key] === "string" ? data[key] : "";
  if (optional && !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MaritimeDeclarationValidationError(`${label} est obligatoire et doit être une date valide.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MaritimeDeclarationValidationError(`${label} doit être une date valide.`);
  }
  return value;
}

export function validateMaritimeDeclaration(value: unknown): MaritimeDeclarationInput {
  if (!isRecord(value)) {
    throw new MaritimeDeclarationValidationError("Les données de la déclaration sont invalides.");
  }

  const companyName = requiredText(value, "companyName", "Le nom de la société", 200);
  const boatName = requiredText(value, "boatName", "Le nom du bateau", 150);
  const boatRegistration = requiredText(value, "boatRegistration", "L'immatriculation", 80);
  const boatCapacity = decimalText(value.boatCapacity, "La capacité du bateau", 12, 3, false);
  const captainName = requiredText(value, "captainName", "Le nom du commandant", 150);
  const captainPhone = optionalText(value, "captainPhone", "Le téléphone du commandant", 40);
  const captainEmail = optionalText(value, "captainEmail", "L'email du commandant", 254);

  if (!captainPhone && !captainEmail) {
    throw new MaritimeDeclarationValidationError(
      "Renseignez au moins un moyen de contact du commandant : téléphone ou email.",
    );
  }
  if (captainEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captainEmail)) {
    throw new MaritimeDeclarationValidationError("L'email du commandant n'est pas valide.");
  }

  const originDepartureDate = isoDate(value, "originDepartureDate", "La date de départ du port d'origine");
  const arrivalDate = isoDate(value, "arrivalDate", "La date d'arrivée ici");
  const departureDate = isoDate(value, "departureDate", "La date de départ d'ici", true);
  if (originDepartureDate > arrivalDate || (departureDate && arrivalDate > departureDate)) {
    throw new MaritimeDeclarationValidationError(
      "Les dates doivent respecter l'ordre : départ du port d'origine, arrivée ici, puis départ d'ici.",
    );
  }

  if (value.products !== undefined && !Array.isArray(value.products)) {
    throw new MaritimeDeclarationValidationError("La liste des produits est invalide.");
  }

  const productIds = new Set<string>();
  const products = (value.products ?? []).map((item, index): MaritimeProductInput => {
    if (!isRecord(item)) {
      throw new MaritimeDeclarationValidationError(`Le produit ${index + 1} est invalide.`);
    }
    const id = typeof item.id === "string" ? item.id.trim() : undefined;
    const productId = typeof item.productId === "string" ? item.productId.trim() : undefined;
    const productTypeValue = typeof item.productType === "string" ? item.productType.trim() : "";
    if (item.id !== undefined && (!id || id.length > 100)) {
      throw new MaritimeDeclarationValidationError(`L'identifiant du produit ${index + 1} est invalide.`);
    }
    if (productId && productId.length > 100) {
      throw new MaritimeDeclarationValidationError(`L'identifiant du produit ${index + 1} est invalide.`);
    }
    const quantity = decimalText(item.quantity, `La quantité du produit ${index + 1}`, 14, 3, false);
    const unitPriceText = item.unitPrice;
    const unitPrice = unitPriceText !== undefined
      ? decimalText(unitPriceText, `Le prix unitaire du produit ${index + 1}`, 14, 2, true)
      : "0";
    const productType = productTypeValue || (productId ? productId : "");
    if (!productType && !productId) {
      throw new MaritimeDeclarationValidationError(`Le type du produit ${index + 1} est obligatoire.`);
    }
    if (id && productIds.has(id)) {
      throw new MaritimeDeclarationValidationError("Une ligne produit ne peut être envoyée qu'une seule fois.");
    }
    if (id) productIds.add(id);
    return {
      ...(id ? { id } : {}),
      ...(productId ? { productId } : {}),
      ...(productType ? { productType } : {}),
      quantity,
      ...(unitPrice !== "0" ? { unitPrice } : {}),
    };
  });

  return {
    companyName,
    boatName,
    boatRegistration,
    boatCapacity,
    captainName,
    captainPhone,
    captainEmail,
    originDepartureDate,
    arrivalDate,
    departureDate,
    products,
  };
}

export function calculateMaritimeTotals(
  products: Array<{ quantity: Decimal.Value; unitPrice: Decimal.Value }>,
): { lineTotals: Array<string | null>; total: string } {
  let total = new ExactDecimal(0);
  const lineTotals = products.map(({ quantity, unitPrice }) => {
    const quantityText = String(quantity);
    const unitPriceText = String(unitPrice);
    if (
      !/^\d+(?:\.\d{0,3})?$/.test(quantityText) ||
      !/^\d+(?:\.\d{0,2})?$/.test(unitPriceText)
    ) return null;
    const quantityDecimal = new ExactDecimal(quantityText);
    const unitPriceDecimal = new ExactDecimal(unitPriceText);
    if (!quantityDecimal.gt(0) || unitPriceDecimal.isNegative()) return null;
    const lineTotal = quantityDecimal.mul(unitPriceDecimal);
    total = total.plus(lineTotal);
    return formatExactDecimal(lineTotal);
  });
  return { lineTotals, total: formatExactDecimal(total) };
}

export function snapshotMaritimeDeclaration(record: MaritimeDeclarationRecord) {
  const { lineTotals, total } = calculateMaritimeTotals(
    record.products.map((product) => ({
      quantity: product.quantity.toString(),
      unitPrice: product.unitPrice.toString(),
    })),
  );
  return {
    id: record.id,
    maritimeUserId: record.maritimeUserId,
    companyName: record.companyName,
    boatName: record.boatName,
    boatRegistration: record.boatRegistration,
    boatCapacity: record.boatCapacity.toString(),
    captainName: record.captainName,
    captainPhone: record.captainPhone,
    captainEmail: record.captainEmail,
    originDepartureDate: record.originDepartureDate.toISOString().slice(0, 10),
    arrivalDate: record.arrivalDate.toISOString().slice(0, 10),
    departureDate: record.departureDate?.toISOString().slice(0, 10) ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    products: record.products.map((product, index) => ({
      id: product.id,
      productType: product.productType,
      quantity: product.quantity.toString(),
      unitPrice: product.unitPrice.toString(),
      lineTotal: lineTotals[index],
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    })),
    total,
  };
}

function formatExactDecimal(value: Decimal): string {
  const [whole, fraction = ""] = value.toFixed(5).split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function formatMaritimeAmount(value: string): string {
  const [whole, fraction] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${groupedWhole}${fraction ? `,${fraction}` : ""}`;
}
