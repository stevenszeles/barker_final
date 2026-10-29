import { readFileSync } from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(`../public/data/${name}.json`,import.meta.url),'utf8'));
const data=read('portfolio'),workspace=read('workspace'),market=read('market');
if (!workspace.as_of || Number.isNaN(Date.parse(workspace.as_of)) || workspace.as_of!==data.as_of) throw new Error('Publication dates must match');
const accounts=Object.keys(workspace.state?.accounts ?? {});
if (!accounts.length) throw new Error('A populated portfolio is required');
for (const account of ['ALL',...new Set([...accounts,...Object.keys(workspace.state.balanceHistory)])]) {
 if (!Array.isArray(data.responses[`/portfolio/nav?account=${account}`])) throw new Error(`NAV missing for ${account}`);
}
for (const symbol of ['^GSPC','XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLK','XLB','XLRE','XLU']) {
 if (!market[symbol]?.length) throw new Error(`Market history missing: ${symbol}`);
 if (market[symbol].some(([date])=>date>workspace.as_of)) throw new Error('Market history extends beyond the publication date');
}
console.log(`Verified ${accounts.length} accounts as of ${workspace.as_of}`);
