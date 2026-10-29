import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../public/data/portfolio.json', import.meta.url), 'utf8'));
if (!data.as_of || Number.isNaN(Date.parse(data.as_of))) throw new Error('A valid portfolio as-of date is required');
const accounts = data.responses?.['/portfolio/accounts']?.accounts;
if (!accounts?.length) throw new Error('A populated portfolio snapshot is required before publishing');
for (const account of ['ALL', ...accounts.map((row) => row.account)]) {
  for (const path of ['/portfolio/snapshot', '/portfolio/nav', '/positions', '/trade/blotter']) {
    if (!(`${path}?account=${account}` in data.responses)) throw new Error(`Missing ${path} for ${account}`);
  }
}
if (!data.responses['/risk/profile']) throw new Error('Risk analysis is missing');
console.log(`Verified published data as of ${data.as_of}`);

const workspace = JSON.parse(readFileSync(new URL('../public/data/workspace.json', import.meta.url), 'utf8'));
const market = JSON.parse(readFileSync(new URL('../public/data/market.json', import.meta.url), 'utf8'));
if (workspace.as_of !== data.as_of || !Object.keys(workspace.state?.accounts ?? {}).length) throw new Error('Original dashboard workspace is missing or dated incorrectly');
if (!market['^GSPC']?.length) throw new Error('Published benchmark history is missing');
