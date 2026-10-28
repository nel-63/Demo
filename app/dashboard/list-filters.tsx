import Form from "next/form";
import Link from "next/link";

type Option = { value: string; label: string };

type Filter = {
  name: string;
  label: string;
  value: string;
  options: Option[];
};

export default function ListFilters({
  action,
  q,
  placeholder,
  filters,
}: {
  action: string;
  q: string;
  placeholder: string;
  filters: Filter[];
}) {
  const active = q !== "" || filters.some((filter) => filter.value !== "");
  // La clé recrée le formulaire quand les critères changent (utile après « Réinitialiser »).
  const formKey = [q, ...filters.map((filter) => filter.value)].join("|");

  return (
    <Form
      key={formKey}
      action={action}
      className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4"
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-500">
          Recherche
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.name}>
          <label htmlFor={filter.name} className="mb-1 block text-xs font-medium text-slate-500">
            {filter.label}
          </label>
          <select
            id={filter.name}
            name={filter.name}
            defaultValue={filter.value}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tous</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button
        type="submit"
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Filtrer
      </button>
      {active && (
        <Link
          href={action}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Réinitialiser
        </Link>
      )}
    </Form>
  );
}
