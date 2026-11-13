import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
export default async function MaritimeFormFinishedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");
  return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold text-slate-900">Formulaire terminé</h1>
    <p className="mt-3 text-slate-700">Votre déclaration est enregistrée. Si vous revenez dans l'espace maritime, un nouveau formulaire sera prêt pour un autre passage.</p>
    <Link href="/dashboard/maritime/new" className="mt-6 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Enregistrer un autre passage</Link>
  </section>;
}
