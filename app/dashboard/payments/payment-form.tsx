"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type TransportOption = {
  id: string;
  assignedAt: string;
  amountDue: string;
  product: { name: string; type: string };
  vehicle: { licensePlate: string };
  supervisor: { user: { firstName: string; lastName: string } };
};

const methods = [
  { value: "CASH", label: "Espèces" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "CHECK", label: "Chèque" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "OTHER", label: "Autre" },
];

function money(value: string) {
  return `${Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

export default function PaymentForm({
  transports,
}: {
  transports: TransportOption[];
}) {
  const router = useRouter();
  const [method, setMethod] = useState("CASH");
  const [assignmentId, setAssignmentId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [change, setChange] = useState<string | null>(null);

  const selectedTransport = transports.find((item) => item.id === assignmentId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setChange(null);

    if (!selectedTransport) {
      setError("Sélectionnez un transport à payer.");
      return;
    }

    setLoading(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }

      setChange(result.payment.changeReturned);
      setSuccess("Paiement intégral enregistré.");
      form.reset();
      setAssignmentId("");
      setMethod("CASH");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="assignmentId" className="mb-1 block text-sm font-medium text-slate-700">
          Transport à payer
        </label>
        <select
          id="assignmentId"
          name="assignmentId"
          required
          value={assignmentId}
          onChange={(event) => setAssignmentId(event.target.value)}
          disabled={transports.length === 0}
          className={inputClass}
        >
          <option value="" disabled>Sélectionner un transport</option>
          {transports.map((item) => (
            <option key={item.id} value={item.id}>
              {item.product.name} — {item.vehicle.licensePlate} — {money(item.amountDue)}
            </option>
          ))}
        </select>
        {transports.length === 0 && (
          <p className="mt-1 text-sm text-amber-700">
            Aucun transport éligible au paiement intégral. Vérifiez les montants des transports.
          </p>
        )}
      </div>

      {selectedTransport && (
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-sm text-blue-800">Montant officiel à régler</p>
          <p className="mt-1 text-xl font-bold text-blue-900">
            {money(selectedTransport.amountDue)}
          </p>
          <p className="mt-1 text-xs text-blue-800">
            Le montant est fixé dans le transport et ne peut pas être changé depuis la caisse.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-slate-700">Mode de paiement</label>
        <select id="paymentMethod" name="paymentMethod" required value={method}
          onChange={(event) => setMethod(event.target.value)} className={inputClass}>
          {methods.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reference" className="mb-1 block text-sm font-medium text-slate-700">
          Référence {method === "CASH" ? "(facultative)" : "(obligatoire)"}
        </label>
        <input id="reference" name="reference" type="text" maxLength={150}
          required={method !== "CASH"} className={inputClass}
          placeholder={method === "CASH" ? "Référence facultative" : "Numéro de transaction ou de chèque"} />
      </div>

      <div>
        <label htmlFor="amountReceived" className="mb-1 block text-sm font-medium text-slate-700">Montant reçu (MGA)</label>
        <input id="amountReceived" name="amountReceived" type="number" min="0.01"
          max="999999999999.99" step="0.01" required className={inputClass} />
      </div>

      <p className="text-xs text-slate-700">
        Aucun paiement partiel. En espèces, la monnaie rendue est calculée automatiquement.
      </p>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && (
        <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p>{success}</p>
          {change !== null && <p className="mt-1 font-semibold">Monnaie rendue : {money(change)}</p>}
        </div>
      )}

      <button type="submit" disabled={loading || !selectedTransport}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
        {loading ? "Enregistrement..." : "Enregistrer le paiement intégral"}
      </button>
    </form>
  );
}