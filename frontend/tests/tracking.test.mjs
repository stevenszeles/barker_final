import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { dailySectorPerformance,linkDailyContributions } from '../src/services/sector-performance.js';
import { rebaseSettingsDraft,settingsOnly } from '../src/services/settings-draft.js';
import { prepareUpdateBundle } from '../src/services/update-bundle.js';
test('contribution uses actual capital, income and fees; unverified data stays unavailable',()=>{
 const input={openingValue:150,closingValue:182,capitalFlow:20,income:2,fees:1,openingNav:1000,reconciled:true};
 assert.deepEqual(dailySectorPerformance(input),{pnl:13,contribution:.013,sectorReturn:13/150});
 assert.equal(dailySectorPerformance({...input,reconciled:false}).contribution,null);
 assert.equal(dailySectorPerformance({...input,openingValue:0,longOnly:false}).sectorReturn,null);
});
test('linked sector contributions reconcile to compounded portfolio return',()=>{
 const r=linkDailyContributions([{portfolioReturn:.1,sectors:{Energy:.06,Cash:.04}},{portfolioReturn:-.05,sectors:{Energy:-.03,Cash:-.02}}]);
 assert.ok(Math.abs(r.totalReturn-.045)<1e-10);assert.ok(Math.abs(Object.values(r.contributions).reduce((a,b)=>a+b,0)-r.totalReturn)<1e-10);
 assert.equal(linkDailyContributions([{portfolioReturn:.1,sectors:{Energy:.09}}]),null);
});
test('draft rebasing preserves other published changes and flags conflicts',()=>{
 const base=settingsOnly({sectorOverrides:{a:'Energy',b:'Energy'}}),draft={base,settings:settingsOnly({sectorOverrides:{a:'Financials',b:'Energy'}})};
 assert.deepEqual(rebaseSettingsDraft(draft,{...base,sectorOverrides:{a:'Energy',b:'Utilities'}}).settings.sectorOverrides,{a:'Financials',b:'Utilities'});
 assert.equal(rebaseSettingsDraft(draft,{...base,sectorOverrides:{a:'Materials',b:'Energy'}}).conflicts.length,1);
});
const file=(name,text)=>({name,text:async()=>text});
const pos=file('All-Accounts-Positions-2026-11-04-090000.csv','Positions as of 11/04/2026'),balance=file('Limit Liability Company_XXXX123_Balances_20261104-090000.CSV','same');
const parsers={positions:()=>({'Limit_Liability_Company ...123':{}}),balances:text=>({account:'Limit_Liability_Company ...123',data:[['2026-11-04',text==='same'?100:200]]}),realized:()=>[{}]};
test('bundle combines matching duplicates and rejects missing or conflicting balances',async()=>{
 const r=await prepareUpdateBundle([pos,balance,file('Limit Liability Company_XXXX123_Balances_20261104-090010.CSV','same')],settingsOnly({}),parsers);
 const zip=await JSZip.loadAsync(r.bytes);assert.ok(zip.file('publication-settings.json'));assert.equal(Object.keys(zip.files).filter(n=>n.includes('Balances')).length,1);
 await assert.rejects(prepareUpdateBundle([pos],{},parsers),/Missing balance/);
 await assert.rejects(prepareUpdateBundle([pos,balance,file('Limit Liability Company_XXXX123_Balances_20261104-090010.CSV','different')],{},parsers),/Conflicting balance/);
});
test('conflicting transaction exports cannot silently replace each other',async()=>{
 const tx=text=>file(`Limit_Liability_Company_XXX123_Transactions_${text}.csv`,`"Date","Action"\n${text}`);
 await assert.rejects(prepareUpdateBundle([pos,balance,tx('one'),tx('two')],{},parsers),/one transaction export/);
});
