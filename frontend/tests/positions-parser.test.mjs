import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
test('futures summary rows are retained separately from tradeable holdings', async()=>{
 const source=await readFile(new URL('../src/portfolio-dashboard.jsx',import.meta.url),'utf8');
 const result=await build({stdin:{contents:source+'\nexport {parsePositionsCSV};',resolveDir:new URL('../src',import.meta.url).pathname,loader:'jsx'},bundle:true,platform:'node',format:'cjs',write:false,define:{'import.meta.env.VITE_STATIC_MODE':'undefined','import.meta.env.VITE_API_BASE_URL':'undefined'}});
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const account=module.exports.parsePositionsCSV('Limit Liability Company ...145\nSymbol,Description,Qty,Price,Change,Change,Mkt Val,Change,Change,Cost Basis\nABC,Example,10,5,0,0,50,0,0,40\nFutures Cash,--,--,--,--,--,"$3,604.00"\nFutures Positions Market Value,--,--,--,--,--,-$656.25\nCash & Cash Investments,--,--,--,--,--,100\nAccount Total,--,--,--,--,--,"$3,097.75",--,--,40')['Limit_Liability_Company ...145'];
 assert.equal(account.futuresCash,3604);assert.equal(account.futuresMarketValue,-656.25);assert.equal(account.cash,100);assert.equal(account.positions.length,1);
 assert.equal(account.total,account.cash+account.futuresCash+account.futuresMarketValue+account.positions[0].mktVal);
});
