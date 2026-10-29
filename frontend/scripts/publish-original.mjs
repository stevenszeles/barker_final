import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const folder = process.argv[2];
if (!folder) throw new Error('CSV folder is required');
const source = await readFile('src/portfolio-dashboard.jsx', 'utf8');
const out = path.resolve('node_modules/.barker-publish.cjs');
await build({stdin:{contents:source+'\nexport { parsePositionsCSV, parseBalancesCSV, parseRealizedCSV, buildSharedDashboardStatePayload, buildAggregateHistory };',resolveDir:path.resolve('src'),loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile:out,define:{'import.meta.env.VITE_API_BASE_URL':'undefined','import.meta.env.VITE_STATIC_MODE':'undefined'}});
const { default: parsers } = await import(pathToFileURL(out));
let accounts={}, balanceHistory={}, realizedTrades=[], positionsAsOf=null;
const inputNames=(await readdir(folder)).filter(name=>/\.csv$/i.test(name)).sort();
if (inputNames.filter(name=>/positions/i.test(name)).length!==1 || inputNames.filter(name=>/realized/i.test(name)).length!==1) throw new Error('Keep exactly one current positions export and one realized export in the CSV folder');
for (const name of inputNames) {
 if (!/\.csv$/i.test(name)) continue;
 const text=await readFile(path.join(folder,name),'utf8');
 if (/positions/i.test(name)) {
  const date=text.split('\n')[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!date) throw new Error('Positions export has no readable data date');
  positionsAsOf=`${date[3]}-${date[1].padStart(2,'0')}-${date[2].padStart(2,'0')}`;
 }
 if (/positions/i.test(name)) accounts={...accounts,...parsers.parsePositionsCSV(text.replace(/^"((?:Limit(?:_| )Liability(?:_| )Company|Individual) \.\.\.\d+)"[,]?\r?$/gm,'$1').replace(/^"Positions Total"/gm, '"Account Total"'))};
 else if (/balances/i.test(name)) { const p=parsers.parseBalancesCSV(text,name); if (balanceHistory[p.account]) throw new Error(`Multiple balance exports for ${p.account}`); if (!p.data.length) throw new Error(`Empty balance history: ${name}`); balanceHistory[p.account]=p.data; }
 else if (/realized/i.test(name)) realizedTrades.push(...parsers.parseRealizedCSV(text));
}
const dates=Object.values(balanceHistory).flatMap(rows=>rows.map(row=>row[0])).sort();
const asOf=dates.at(-1);
if (positionsAsOf!==asOf) throw new Error('Positions and balance exports have different dates');
if (Object.values(balanceHistory).some(rows=>rows.at(-1)?.[0]!==asOf)) throw new Error('Balance exports have different latest dates; provide one consistent daily batch');
if (!Object.keys(accounts).length || !asOf || !realizedTrades.length) throw new Error('Incomplete publication');
const state=parsers.buildSharedDashboardStatePayload({accounts,balanceHistory,realizedTrades});
await mkdir('public/data',{recursive:true});
await writeFile('public/data/workspace.json',JSON.stringify({state,updated_at:asOf+'T00:00:00Z',as_of:asOf,version:Number(asOf.replaceAll('-',''))}));
console.log(`Original dashboard snapshot: ${Object.keys(accounts).length} accounts, ${realizedTrades.length} trades, as of ${asOf}`);

const responses = {};
for (const account of ['ALL', ...new Set([...Object.keys(accounts),...Object.keys(balanceHistory)])]) {
 const history=account==='ALL' ? parsers.buildAggregateHistory(balanceHistory) : balanceHistory[account] || [];
 responses[`/portfolio/nav?account=${account}`]=history.map(([date,nav])=>({date,nav,bench:null,twr:null}));
}
await writeFile('public/data/nav-history.json', JSON.stringify({as_of:asOf,responses}));
