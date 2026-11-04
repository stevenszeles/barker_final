import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportPositionsWorkbook, readPositionSectorChanges } from '../src/services/positions-excel.js';
const sectors = ['Energy', 'Financials', 'Unclassified'];
const records = [
  { account:'...001', accountLabel:'One', symbol:'ABC', sector:'Energy', assignment:'Auto', qty:5, marketValue:123.45, gainPct:12.5 },
  { account:'...002', accountLabel:'Two', symbol:'ABC', sector:'Energy', assignment:'Energy', qty:9, marketValue:222.22 },
];
async function workbook() { const book = new ExcelJS.Workbook(); await book.xlsx.load(await exportPositionsWorkbook(records, sectors)); return book; }
test('real XLSX preserves numbers, sector dropdowns, and unchanged Auto assignments', async () => {
 const book = await workbook(), sheet = book.getWorksheet('Positions');
 assert.equal(sheet.getCell('I2').value,123.45); assert.equal(sheet.getCell('M2').value,0.125);
 assert.equal(sheet.getCell('F2').dataValidation.type,'list');
 assert.deepEqual(await readPositionSectorChanges(await book.xlsx.writeBuffer(),records,sectors),[]);
});
test('only edited sectors return and matching uses account plus symbol', async () => {
 const book = await workbook(); book.getWorksheet('Positions').getCell('F3').value='Financials';
 const changes = await readPositionSectorChanges(await book.xlsx.writeBuffer(),records,sectors);
 assert.equal(changes.length,1); assert.equal(changes[0].account,'...002'); assert.equal(changes[0].assignment,'Financials');
});
test('Auto resets a manual assignment', async () => {
 const book = await workbook();book.getWorksheet('Positions').getCell('F3').value='Auto';
 assert.equal((await readPositionSectorChanges(await book.xlsx.writeBuffer(),records,sectors))[0].assignment,'Auto');
});
test('invalid sector, unknown holdings, and stale assignments reject the entire import', async () => {
 for (const [cell,value,pattern] of [['F3','Made up',/valid sector/],['N3','...999',/no longer matches/],['O3','Auto',/changed since export/]]) {
  const book = await workbook();const sheet=book.getWorksheet('Positions');sheet.getCell('F2').value='Financials';sheet.getCell('F3').value='Financials';sheet.getCell(cell).value=value;
  await assert.rejects(readPositionSectorChanges(await book.xlsx.writeBuffer(),records,sectors),pattern);
 }
});
