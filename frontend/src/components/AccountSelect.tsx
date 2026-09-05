import { accountLabel } from "../lib/format";
import type { Account } from "../types";

export function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field field--compact">
      <span>Scope</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="ALL">All accounts</option>
        {accounts.map((account) => (
          <option key={account.account} value={account.account}>
            {accountLabel(account.account)}
          </option>
        ))}
      </select>
    </label>
  );
}
