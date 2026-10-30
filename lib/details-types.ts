// Types partagés entre l'API des détails et le panneau (client).

export type Badge = "ok" | "warn" | "bad" | "info" | "muted";

export type Cell = {
  t: string; // texte affiché
  s?: number | string; // valeur de tri (nombre, date...) si différente du texte
  badge?: Badge; // affiche une pastille avec icône + libellé
};

export type Column = { key: string; label: string; align?: "right" };

export type DetailsRow = { id: string; cells: Record<string, Cell> };

export type DetailsResult = {
  title: string;
  total: string; // chiffre de la carte (nombre, montant ou tonnage)
  count: number; // éléments correspondant à la recherche
  truncated: boolean;
  columns: Column[];
  rows: DetailsRow[];
  href: string | null; // page complète (null si elle n'existe pas pour ce rôle)
  locations: { id: string; name: string }[] | null; // filtre par lieu (administrateur)
};
