export const PASSAGES_PAGE_SIZE = 4;
export const MARITIME_DECLARATIONS_PAGE_SIZE = 10;
export const MARITIME_USERS_PAGE_SIZE = 10;

export function getTotalPages(total: number, pageSize = PASSAGES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function resolvePage(
  value: string | string[] | undefined,
  total: number,
  pageSize = PASSAGES_PAGE_SIZE,
): { page: number; totalPages: number } {
  const totalPages = getTotalPages(total, pageSize);
  const rawPage = Array.isArray(value) ? value[0] : value;
  const requestedPage = typeof rawPage === "string" && /^\d+$/.test(rawPage)
    ? Number(rawPage)
    : Number.NaN;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1
    ? Math.min(requestedPage, totalPages)
    : 1;

  return { page, totalPages };
}
