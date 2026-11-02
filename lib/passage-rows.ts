// Sélection commune pour afficher des passages (fiches des régisseurs et des lieux).
export const PASSAGE_ROW_SELECT = {
  id: true,
  assignedAt: true,
  origin: true,
  destination: true,
  vehicleInfo: true,
  driverName: true,
  product: { select: { name: true, type: true, tonnage: true } },
  supervisor: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
  assignedLocation: { select: { id: true, name: true } },
  payment: { select: { paymentMethod: true, reference: true, amountDue: true } },
} as const;

export const FICHE_PAGE_SIZE = 20;
