export const PASSAGES_PAGE_SIZE = 4;

export function getTotalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PASSAGES_PAGE_SIZE));
}

export function resolvePage(
  value: string | string[] | undefined,
  total: number,
): { page: number; totalPages: number } {
  const totalPages = getTotalPages(total);
  const rawPage = Array.isArray(value) ? value[0] : value;
  const requestedPage = typeof rawPage === "string" && /^\d+$/.test(rawPage)
    ? Number(rawPage)
    : Number.NaN;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1
    ? Math.min(requestedPage, totalPages)
    : 1;

  return { page, totalPages };
}
