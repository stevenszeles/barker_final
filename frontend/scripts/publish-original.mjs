import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const folder = process.argv[2];
if (!folder) throw new Error('CSV folder is required');
const source = await readFile('src/portfolio-dashboard.jsx', 'utf8');
const out = path.resolve('node_modules/.barker-publish.cjs');
await build({stdin:{contents:source+'\nexport { parsePositionsCSV, parseBalancesCSV, parseRealizedCSV, buildSharedDashboardStatePayload };',resolveDir:path.resolve('src'),loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile:out,define:{'import.meta.env.VITE_API_BASE_URL':'undefined','import.meta.env.VITE_STATIC_MODE':'undefined'}});
const { default: parsers } = await import(pathToFileURL(out));
let accounts={}, balanceHistory={}, realizedTrades=[];
for (const name of await readdir(folder)) {
 if (!/\.csv$/i.test(name)) continue;
 const text=await readFile(path.join(folder,name),'utf8');
 if (/positions/i.test(name)) accounts={...accounts,...parsers.parsePositionsCSV(text.replace(/^"((?:Limit(?:_| )Liability(?:_| )Company|Individual) \.\.\.\d+)"[,]?\r?$/gm,'$1'))};
 else if (/balances/i.test(name)) { const p=parsers.parseBalancesCSV(text,name); balanceHistory[p.account]=p.data; }
 else if (/realized/i.test(name)) realizedTrades.push(...parsers.parseRealizedCSV(text));
}
const dates=Object.values(balanceHistory).flatMap(rows=>rows.map(row=>row[0])).sort();
const asOf=dates.at(-1);
if (!Object.keys(accounts).length || !asOf || !realizedTrades.length) throw new Error('Incomplete publication');
for (const account of Object.values(accounts)) {
 account.cost = account.positions.reduce((sum,p)=>sum+(Number(p.costBasis)||0),0);
}
const state=parsers.buildSharedDashboardStatePayload({accounts,balanceHistory,realizedTrades});
await mkdir('public/data',{recursive:true});
await writeFile('public/data/workspace.json',JSON.stringify({state,updated_at:asOf+'T00:00:00Z',as_of:asOf,version:1}));
console.log(`Original dashboard snapshot: ${Object.keys(accounts).length} accounts, ${realizedTrades.length} trades, as of ${asOf}`);
