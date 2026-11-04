import JSZip from 'jszip';

export async function prepareUpdateBundle(files, settings, parsers) {
  const zip = new JSZip();
  const rows = await Promise.all(Array.from(files).map(async file => ({ name: file.name, text: await file.text() })));
  const positions = rows.filter(file => /^All-Accounts-Positions-.*\.csv$/i.test(file.name));
  if (positions.length !== 1) throw new Error('Select exactly one current all-accounts positions export.');
  const match = positions[0].text.split('\n')[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) throw new Error('Positions file has no readable snapshot date.');
  const asOf = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const accounts = parsers.positions(positions[0].text.replace(/^"((?:Limit(?:_| )Liability(?:_| )Company|Individual) \.\.\.\d+)"[,]?\r?$/gm, '$1').replace(/^"Positions Total"/gm, '"Account Total"'));
  if (!Object.keys(accounts).length) throw new Error('No holdings found in the positions export.');
  const balances = new Map();
  const included = new Map();
  let realized = 0, transactions = 0;
  const transactionAccounts = new Map();
  for (const file of rows) {
    if (/[/\\]/.test(file.name)) throw new Error('Invalid export file name.');
    if (included.has(file.name)) {
      if (included.get(file.name) !== file.text) throw new Error(`Conflicting copies of ${file.name}.`);
      continue;
    }
    if (/Balances_/i.test(file.name)) {
      const parsed = parsers.balances(file.text, file.name);
      if (!accounts[parsed.account]) throw new Error(`Balance account is absent from positions: ${file.name}`);
      if (!parsed.data.length || [...parsed.data].map(row => row[0]).sort().at(-1) !== asOf) throw new Error(`Balance dates must match ${asOf}: ${file.name}`);
      const signature = JSON.stringify([...parsed.data].sort((a,b) => a[0].localeCompare(b[0])));
      if (balances.has(parsed.account)) {
        if (balances.get(parsed.account) !== signature) throw new Error(`Conflicting balance histories for ${parsed.account}. Select one.`);
        continue;
      }
      balances.set(parsed.account, signature);
    } else if (/Realized/i.test(file.name)) {
      if (++realized > 1 || !parsers.realized(file.text).length) throw new Error('Select one valid realized gain/loss export.');
    } else if (/Transactions_/i.test(file.name)) {
      const suffix = file.name.match(/_X{3,4}(\d+)_/i)?.[1];
      if (!Object.keys(accounts).some(name => name.endsWith(`...${suffix}`))) throw new Error(`Unknown transaction account: ${file.name}`);
      if (!/\.csv$/i.test(file.name) || !file.text.startsWith('"Date","Action"')) throw new Error('Use the Schwab transaction CSV export.');
      if (transactionAccounts.has(suffix)) {
        if (transactionAccounts.get(suffix) !== file.text) throw new Error(`Select one transaction export per account: ...${suffix}.`);
        continue;
      }
      transactionAccounts.set(suffix, file.text);
      transactions++;
    } else if (file !== positions[0]) throw new Error(`Unsupported file: ${file.name}. Select brokerage CSV exports only.`);
    included.set(file.name, file.text);
    zip.file(file.name, file.text);
  }
  const missing = Object.keys(accounts).filter(name => !name.startsWith('Individual') && !balances.has(name));
  if (missing.length) throw new Error(`Missing balance histories: ${missing.join(', ')}.`);
  zip.file('publication-settings.json', JSON.stringify({ format:'barker-sector-settings-v1', ...settings }, null, 2));
  zip.file('barker-update.json', JSON.stringify({format:'barker-update-v1', as_of:asOf}));
  return { bytes: await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}), asOf,
    summary:`${Object.keys(accounts).length} accounts · ${balances.size} balance histories · ${transactions} transaction exports. ${realized ? 'Realized gains included.' : 'No new realized gain/loss export: publisher retains the previous version.'}` };
}
