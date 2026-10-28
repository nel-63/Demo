// Petits utilitaires pour appeler directement les handlers de route.

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function params(id = "id-1") {
  return { params: Promise.resolve({ id }) };
}

export async function read(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

export const ADMIN = {
  id: "admin-1",
  firstName: "Ada",
  lastName: "Admin",
  email: "admin@test.mg",
  role: "ADMIN" as const,
  designation: null,
  isActive: true,
};

export const SUPERVISOR = {
  id: "user-sup-1",
  firstName: "Rina",
  lastName: "Regisseur",
  email: "rina@test.mg",
  role: "SUPERVISOR" as const,
  designation: "Régisseur",
  isActive: true,
};
