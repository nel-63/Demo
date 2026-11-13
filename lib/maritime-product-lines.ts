import type { Prisma } from "@/app/generated/prisma/client";
import {
  MaritimeDeclarationValidationError,
  type MaritimeProductInput,
} from "@/lib/maritime-declarations";

// Associe chaque ligne au produit du catalogue actif (nom et prix officiels).
export async function resolveMaritimeProductLines(
  tx: Prisma.TransactionClient,
  products: MaritimeProductInput[] = [],
) {
  const safeProducts = products ?? [];
  const productIds = safeProducts
    .map((product) => product.productId ?? product.id)
    .filter((value): value is string => Boolean(value));

  const catalog = productIds.length
    ? (await tx.maritimeProductType.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, unitPrice: true },
      })) ?? []
    : [];

  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  return safeProducts.map((product) => {
    const catalogItem = product.productId ? catalogById.get(product.productId) : null;
    const resolvedName = catalogItem?.name ?? product.productType ?? "";
    const resolvedUnitPrice = catalogItem ? catalogItem.unitPrice.toString() : (product.unitPrice ?? "0");
    if (product.productId && !catalogItem) {
      throw new MaritimeDeclarationValidationError("Un produit maritime sélectionné est introuvable ou désactivé.");
    }
    return {
      productTypeId: catalogItem?.id ?? null,
      productType: resolvedName,
      quantity: product.quantity,
      unitPrice: resolvedUnitPrice,
    };
  });
}
