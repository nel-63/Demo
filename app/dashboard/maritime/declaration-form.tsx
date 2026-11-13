"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  calculateMaritimeTotals,
  formatMaritimeAmount,
  type MaritimeProductInput,
} from "@/lib/maritime-declarations";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

type MaritimeCatalogItem = {
  id: string;
  name: string;
  unitPrice: string;
  isActive: boolean;
};

type DeclarationValues = {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  boatName: string;
  boatRegistration: string;
  boatCapacity: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  originDepartureDate: string;
  arrivalDate: string;
  departureDate: string;
  latitude: string;
  longitude: string;
  products: MaritimeProductInput[];
};

// Une ligne produit porte une clé locale stable : elle ne change pas quand on choisit un type,
// ce qui évite que le champ soit recréé (et perde le focus) à chaque sélection.
type ProductLine = MaritimeProductInput & { key: string };
type InfoValues = Omit<DeclarationValues, "products">;

// Valeur du select pour une ligne déjà enregistrée dont le type n'est plus dans le catalogue actif.
const STORED_TYPE = "__stored__";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-800";
const SECTION_CLASS = "border-b border-slate-200 pb-2 pt-3 text-lg font-semibold text-slate-900";

const EMPTY_VALUES: DeclarationValues = {
  companyName: "",
  contactEmail: "",
  contactPhone: "",
  boatName: "",
  boatRegistration: "",
  boatCapacity: "",
  captainName: "",
  captainPhone: "",
  captainEmail: "",
  originDepartureDate: "",
  arrivalDate: "",
  departureDate: "",
  latitude: "",
  longitude: "",
  products: [],
};

// Règles métier de l'étape 1 (les mêmes que celles appliquées par le serveur).
function validateInfo(info: InfoValues): string | null {
  if (!info.captainPhone.trim() && !info.captainEmail.trim()) {
    return "Renseignez au moins un moyen de contact du commandant : téléphone ou email.";
  }
  if (
    info.originDepartureDate > info.arrivalDate ||
    (info.departureDate && info.arrivalDate > info.departureDate)
  ) {
    return "Les dates doivent respecter l'ordre : départ du port d'origine, arrivée ici, puis départ d'ici.";
  }
  if (Boolean(info.latitude.trim()) !== Boolean(info.longitude.trim())) {
    return "Renseignez la latitude et la longitude ensemble.";
  }
  return null;
}

// mode "onboarding" : première connexion avec le compte société. Le formulaire crée un compte bateau
// distinct (nouveaux identifiants + nouveau mot de passe) et enregistre le premier passage.
export default function DeclarationForm({
  initial,
  declarationId,
  mode = "declaration",
}: {
  initial?: DeclarationValues;
  declarationId?: string;
  mode?: "declaration" | "onboarding";
}) {
  const onboarding = mode === "onboarding";
  const router = useRouter();
  const [catalog, setCatalog] = useState<MaritimeCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [info, setInfo] = useState<InfoValues>(() => {
    const rest: Partial<DeclarationValues> = { ...(initial ?? EMPTY_VALUES) };
    delete rest.products;
    return rest as InfoValues;
  });
  const [lines, setLines] = useState<ProductLine[]>(() =>
    (initial?.products ?? []).map((product, index) => ({ ...product, key: `saved-${index}` })),
  );
  const nextLineKey = useRef(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [registered, setRegistered] = useState<{ email: string; phone: string; closed: boolean } | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const response = await fetch("/api/maritime-product-types");
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setCatalogError(result.message ?? "Impossible de charger la liste des produits.");
          return;
        }
        const items: MaritimeCatalogItem[] = Array.isArray(result.maritimeProductTypes)
          ? result.maritimeProductTypes
          : [];
        setCatalog(items.filter((item) => item.isActive !== false));
      } catch {
        setCatalogError("Impossible de contacter le serveur pour charger la liste des produits.");
      }
    }
    void loadCatalog();
  }, []);

  function catalogItemOf(line: ProductLine) {
    return line.productId ? catalog.find((item) => item.id === line.productId) : undefined;
  }

  function officialUnitPrice(line: ProductLine) {
    return catalogItemOf(line)?.unitPrice ?? line.unitPrice ?? "0";
  }

  const { total } = calculateMaritimeTotals(
    lines.map((line) => ({ quantity: line.quantity || "0", unitPrice: officialUnitPrice(line) })),
  );

  function setField<K extends keyof InfoValues>(key: K, value: InfoValues[K]) {
    setInfo((current) => ({ ...current, [key]: value }));
  }

  function addLine() {
    nextLineKey.current += 1;
    const key = `new-${nextLineKey.current}`;
    setLines((current) => [...current, { key, productId: "", productType: "", quantity: "", unitPrice: "" }]);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function selectProduct(key: string, selectedId: string) {
    if (selectedId === STORED_TYPE) return;
    const item = catalog.find((entry) => entry.id === selectedId);
    // Une seule mise à jour : type, nom et prix changent ensemble.
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? { ...line, productId: selectedId, productType: item?.name ?? "", unitPrice: item?.unitPrice ?? "" }
          : line,
      ),
    );
  }

  function setQuantity(key: string, quantity: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, quantity } : line)));
  }

  function goToProducts() {
    const problem = validateInfo(info);
    if (problem) {
      setError(problem);
      return;
    }
    if (onboarding) {
      if (password.length < PASSWORD_MIN_LENGTH) {
        setError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`);
        return;
      }
      if (password !== passwordConfirm) {
        setError("Les deux mots de passe ne correspondent pas.");
        return;
      }
    }
    setError("");
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  async function save() {
    setError("");
    const missing = lines.findIndex((line) => !catalogItemOf(line) && !line.productType);
    if (missing !== -1) {
      setError(`Sélectionnez un type de produit pour le produit ${missing + 1}.`);
      return;
    }
    if (
      info.departureDate &&
      !window.confirm(
        "Enregistrer le départ ? Après cet enregistrement, votre compte sera fermé : vous ne pourrez plus vous connecter ni modifier cette déclaration.",
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...info,
        ...(onboarding ? { password, passwordConfirm } : {}),
        products: lines.map((line) => {
          const item = catalogItemOf(line);
          const base = line.id ? { id: line.id } : {};
          // Type du catalogue : le serveur applique le prix officiel.
          // Ligne déjà enregistrée hors catalogue actif : on conserve son nom et son prix.
          return item
            ? { ...base, productId: item.id, productType: item.name, unitPrice: item.unitPrice, quantity: line.quantity }
            : {
                ...base,
                productType: line.productType ?? "",
                ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}),
                quantity: line.quantity,
              };
        }),
      };
      const response = await fetch(
        onboarding
          ? "/api/maritime/onboarding"
          : declarationId ? `/api/maritime/declarations/${declarationId}` : "/api/maritime/declarations",
        {
          method: declarationId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }
      if (onboarding) {
        // Le compte société est fermé par le serveur : on affiche les nouveaux identifiants à utiliser.
        setRegistered({
          email: result.login?.email ?? info.contactEmail,
          phone: result.login?.phone ?? info.contactPhone,
          closed: Boolean(result.accountDeactivated),
        });
        return;
      }
      if (result.accountDeactivated) {
        // La session est coupée par le serveur : on l'explique au lieu de renvoyer sur une page vide.
        setClosed(true);
        return;
      }
      const id = declarationId ?? result.declaration?.id;
      if (typeof id !== "string") {
        setError("La déclaration a été enregistrée, mais sa référence est introuvable.");
        return;
      }
      router.replace(`/dashboard/maritime/${id}`);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  // Étape 1 : « Entrée » ou « Suivant » passe à l'étape 2. Seul le bouton final enregistre.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      goToProducts();
      return;
    }
    void save();
  }

  if (registered) {
    return (
      <section role="status" className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">Compte bateau créé</h2>
        <p className="text-slate-800">
          Votre passage est enregistré. Le compte de la société n&apos;est plus utilisable : connectez-vous
          désormais avec les identifiants du bateau que vous venez de choisir.
        </p>
        <dl className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
          <div className="flex justify-between gap-4 py-1"><dt className="text-slate-600">Email</dt><dd className="font-semibold text-slate-900">{registered.email}</dd></div>
          <div className="flex justify-between gap-4 py-1"><dt className="text-slate-600">Téléphone</dt><dd className="font-semibold text-slate-900">{registered.phone}</dd></div>
          <div className="flex justify-between gap-4 py-1"><dt className="text-slate-600">Mot de passe</dt><dd className="font-semibold text-slate-900">celui que vous venez de définir</dd></div>
        </dl>
        {registered.closed && (
          <p className="text-sm text-slate-700">
            Une date de sortie a été renseignée : ce compte bateau est déjà fermé.
          </p>
        )}
        <Link
          href="/login"
          className="inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
        >
          Aller à la connexion
        </Link>
      </section>
    );
  }

  if (closed) {
    return (
      <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">Départ enregistré</h2>
        <p className="mt-2 text-slate-800">
          Votre déclaration est enregistrée et votre compte est maintenant fermé. Vous ne pouvez plus
          vous connecter avec cet accès.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
        >
          Retour à la connexion
        </Link>
      </section>
    );
  }

  const canAddProduct = catalog.length > 0;
  const steps = [
    { number: 1, label: "Informations" },
    { number: 2, label: "Produits" },
  ] as const;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <ol aria-label="Étapes du formulaire" className="flex gap-3">
        {steps.map((item) => {
          const active = item.number === step;
          const done = item.number < step;
          return (
            <li
              key={item.number}
              aria-current={active ? "step" : undefined}
              className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                active
                  ? "border-blue-700 bg-blue-50 text-blue-800"
                  : done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  active ? "bg-blue-700 text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {done ? "✓" : item.number}
              </span>
              {item.number}. {item.label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <>
          <section className="space-y-4">
            <h2 className={SECTION_CLASS}>Société et bateau</h2>
            <div className="block">
              <span className={LABEL_CLASS}>Nom de la société de pêche</span>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">
                {info.companyName || "Société associée au compte"}
              </p>
            </div>
            {!onboarding && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL_CLASS}>Email de contact du compte</span>
                  <input className={INPUT_CLASS} type="email" required maxLength={254} value={info.contactEmail}
                    onChange={(event) => setField("contactEmail", event.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Téléphone de contact du compte</span>
                  <input className={INPUT_CLASS} type="tel" required maxLength={40} value={info.contactPhone}
                    onChange={(event) => setField("contactPhone", event.target.value)} />
                </label>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL_CLASS}>Nom du bateau</span>
                <input className={INPUT_CLASS} required maxLength={150} value={info.boatName}
                  onChange={(event) => setField("boatName", event.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Immatriculation</span>
                <input className={INPUT_CLASS} required maxLength={80} value={info.boatRegistration}
                  onChange={(event) => setField("boatRegistration", event.target.value)} />
              </label>
            </div>
            <label className="block">
              <span className={LABEL_CLASS}>Capacité du bateau (tonnes)</span>
              <input className={INPUT_CLASS} type="number" min="0.001" max="999999999.999"
                step="0.001" required value={info.boatCapacity}
                onChange={(event) => setField("boatCapacity", event.target.value)} />
            </label>
          </section>

          {onboarding && (
            <section className="space-y-4">
              <h2 className={SECTION_CLASS}>Identifiants de votre compte bateau</h2>
              <p className="text-sm text-slate-600">
                Ces identifiants sont différents de ceux de votre société. Ils serviront à toutes vos
                prochaines connexions (email ou téléphone, avec ce mot de passe).
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL_CLASS}>Email (identifiant)</span>
                  <input className={INPUT_CLASS} type="email" required maxLength={254} autoComplete="email"
                    value={info.contactEmail} onChange={(event) => setField("contactEmail", event.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Téléphone (identifiant)</span>
                  <input className={INPUT_CLASS} type="tel" required maxLength={40} autoComplete="tel"
                    value={info.contactPhone} onChange={(event) => setField("contactPhone", event.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Nouveau mot de passe</span>
                  <input className={INPUT_CLASS} type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={200}
                    autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  <span className="mt-1 block text-xs text-slate-600">Au moins {PASSWORD_MIN_LENGTH} caractères.</span>
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Confirmer le mot de passe</span>
                  <input className={INPUT_CLASS} type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={200}
                    autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
                </label>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className={SECTION_CLASS}>Commandant</h2>
            <label className="block">
              <span className={LABEL_CLASS}>Nom du commandant</span>
              <input className={INPUT_CLASS} required maxLength={150} value={info.captainName}
                onChange={(event) => setField("captainName", event.target.value)} />
            </label>
            <p className="text-sm text-slate-600">Renseignez au moins un moyen de contact : téléphone ou email.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL_CLASS}>Téléphone</span>
                <input className={INPUT_CLASS} type="tel" maxLength={40} value={info.captainPhone}
                  onChange={(event) => setField("captainPhone", event.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Email</span>
                <input className={INPUT_CLASS} type="email" maxLength={254} value={info.captainEmail}
                  onChange={(event) => setField("captainEmail", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={SECTION_CLASS}>Dates</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL_CLASS}>Départ du port d&apos;origine</span>
                <input className={INPUT_CLASS} type="date" required value={info.originDepartureDate}
                  onChange={(event) => setField("originDepartureDate", event.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Entrée (arrivée ici)</span>
                <input className={INPUT_CLASS} type="date" required value={info.arrivalDate}
                  onChange={(event) => setField("arrivalDate", event.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Date de sortie (à renseigner au départ)</span>
                <input className={INPUT_CLASS} type="date" value={info.departureDate}
                  onChange={(event) => setField("departureDate", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={SECTION_CLASS}>Coordonnées de navigation</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL_CLASS}>Latitude</span>
                <input className={INPUT_CLASS} type="number" min="-90" max="90" step="0.000001"
                  value={info.latitude} onChange={(event) => setField("latitude", event.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Longitude</span>
                <input className={INPUT_CLASS} type="number" min="-180" max="180" step="0.000001"
                  value={info.longitude} onChange={(event) => setField("longitude", event.target.value)} />
              </label>
            </div>
            <p className="text-sm text-slate-600">Les coordonnées sont optionnelles ; renseignez latitude et longitude ensemble.</p>
          </section>
        </>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={SECTION_CLASS}>Produits</h2>
            <button
              type="button"
              onClick={addLine}
              disabled={!canAddProduct}
              className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Ajouter un produit
            </button>
          </div>

          {catalogError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {catalogError}
            </p>
          )}
          {!catalogError && !canAddProduct && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Aucun produit maritime actif n&apos;est disponible pour le moment. Vous pourrez ajouter des produits ultérieurement.
            </p>
          )}

          {lines.map((line, index) => {
            const item = catalogItemOf(line);
            const storedOnly = !item && Boolean(line.productType);
            const selectValue = item ? item.id : storedOnly ? STORED_TYPE : "";
            const unitPrice = officialUnitPrice(line);
            const lineTotal = calculateMaritimeTotals([{ quantity: line.quantity || "0", unitPrice }]).lineTotals[0];

            return (
              <fieldset key={line.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                <legend className="px-1 text-sm font-semibold text-slate-700">Produit {index + 1}</legend>
                <label className="block">
                  <span className={LABEL_CLASS}>Type de produit</span>
                  <select
                    className={INPUT_CLASS}
                    value={selectValue}
                    onChange={(event) => selectProduct(line.key, event.target.value)}
                  >
                    <option value="">Sélectionner un produit</option>
                    {storedOnly && <option value={STORED_TYPE}>{line.productType}</option>}
                    {catalog.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Quantité (kg)</span>
                  <input className={INPUT_CLASS} type="number" min="0.001" step="0.001" required
                    value={line.quantity} onChange={(event) => setQuantity(line.key, event.target.value)} />
                </label>
                <div>
                  <span className={LABEL_CLASS}>Prix officiel (Ar/kg)</span>
                  <output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                    {selectValue ? formatMaritimeAmount(unitPrice) : "—"}
                  </output>
                </div>
                <div>
                  <span className={LABEL_CLASS}>Montant de la ligne (Ar)</span>
                  <output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                    {selectValue && lineTotal != null ? formatMaritimeAmount(lineTotal) : "—"}
                  </output>
                </div>
                <button type="button" onClick={() => removeLine(line.key)}
                  aria-label={`Retirer le produit ${index + 1}`}
                  className="self-end rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                  Retirer
                </button>
              </fieldset>
            );
          })}

          {lines.length === 0 && canAddProduct && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">
              Aucun produit ajouté. Utilisez « + Ajouter un produit ».
            </p>
          )}

          <p className="rounded-xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-900" aria-live="polite">
            Total général : {formatMaritimeAmount(total)} Ar
          </p>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      {step === 1 ? (
        <button key="next" type="submit"
          className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800">
          Suivant : choisir les produits
        </button>
      ) : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button key="back" type="button" onClick={() => { setError(""); setStep(1); }} disabled={saving}
            className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto">
            Précédent
          </button>
          <button key="save" type="submit" disabled={saving}
            className="flex-1 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            {saving
              ? "Enregistrement..."
              : onboarding ? "Créer mon compte et enregistrer le passage"
                : declarationId ? "Enregistrer les modifications" : "Créer la déclaration"}
          </button>
        </div>
      )}
    </form>
  );
}
