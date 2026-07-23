import { requireAdmin } from "@/lib/admin-auth";
import { listAllCurrenciesForAdmin } from "@/lib/admin-currencies";
import { updateCurrencyAction } from "@/app/(app)/admin/actions/currencies";

export default async function AdminCurrenciesPage() {
  await requireAdmin();
  const currencies = await listAllCurrenciesForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Currency Registry</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Display-formatting only — no live conversion rates or checkout currency
        change. Enabling a currency here only affects the account preferences
        selector.
      </p>

      {/* One <form> per row, rendered as a sibling of the table (a <form>
          isn't valid markup directly inside <tr>) — each row's inputs and
          submit button reference it via the HTML `form` attribute instead
          of DOM nesting. */}
      {currencies.map((c) => (
        <form key={c.code} id={`currency-form-${c.code}`} action={updateCurrencyAction.bind(null, c.code)} />
      ))}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-zinc-400">
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Symbol</th>
              <th className="py-2 pr-4">Enabled</th>
              <th className="py-2 pr-4">Decimal places</th>
              <th className="py-2 pr-4">Display order</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => {
              const formId = `currency-form-${c.code}`;
              return (
                <tr key={c.code} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-4 font-mono text-red-400">{c.code}</td>
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4">{c.symbol}</td>
                  <td className="py-2 pr-4">
                    <input
                      form={formId}
                      type="checkbox"
                      name="enabled"
                      defaultChecked={c.enabled}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      form={formId}
                      type="number"
                      name="decimalPlaces"
                      min={0}
                      max={4}
                      defaultValue={c.decimal_places}
                      className="min-h-11 w-16 rounded-lg border border-white/10 bg-white/5 px-2 text-white"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      form={formId}
                      type="number"
                      name="displayOrder"
                      defaultValue={c.display_order}
                      className="min-h-11 w-20 rounded-lg border border-white/10 bg-white/5 px-2 text-white"
                    />
                  </td>
                  <td className="py-2">
                    <button form={formId} type="submit" className="text-red-400 underline">
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
