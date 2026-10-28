export type SearchParams = { [key: string]: string | string[] | undefined };

// Lit un paramètre d'URL texte : nettoyé et limité en longueur.
export function readParam(params: SearchParams, key: string, max = 100): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Lit un paramètre d'URL qui doit appartenir à une liste de valeurs autorisées.
export function readChoice<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const value = readParam(params, key, 40);
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

// Découpe la recherche en mots : chaque mot doit être trouvé quelque part.
export function searchWords(q: string): string[] {
  return q.split(/\s+/).filter(Boolean).slice(0, 5);
}
