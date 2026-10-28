"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DriverData = {
  id: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  phoneNumber: string | null;
  licenseNumber: string;
};

export default function DriverEditForm({ driver }: { driver: DriverData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch(`/api/drivers/${driver.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }

      router.replace("/dashboard/drivers");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { name: "firstName", label: "Prénom", value: driver.firstName },
    { name: "lastName", label: "Nom", value: driver.lastName },
    { name: "nationalId", label: "CIN", value: driver.nationalId },
    { name: "phoneNumber", label: "Téléphone", value: driver.phoneNumber ?? "" },
    { name: "licenseNumber", label: "Numéro de permis", value: driver.licenseNumber },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-slate-700">
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            defaultValue={field.value}
            required={field.name !== "phoneNumber"}
            maxLength={field.name === "phoneNumber" ? 30 : 100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
          />
        </div>
      ))}

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button disabled={loading} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
        {loading ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>

      <Link href="/dashboard/drivers" className="block text-center text-sm text-blue-700 hover:underline">
        Annuler
      </Link>
    </form>
  );
}