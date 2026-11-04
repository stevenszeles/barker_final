import ExcelJS from 'exceljs';

const headers = ['Symbol', 'Description', 'Account', 'Type', 'Current Sector', 'Sector Assignment', 'Qty', 'Price', 'Market Value', 'Notional', 'Cost Basis', 'Gain $', 'Gain %', 'Account ID', 'Original Assignment'];

export async function exportPositionsWorkbook(records, sectors) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Positions', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(headers);
  for (const p of records) sheet.addRow([p.symbol, p.description, p.accountLabel, p.type, p.sector, p.assignment, p.qty, p.price, p.marketValue, p.notional, p.cost, p.gain, p.gainPct == null ? null : p.gainPct / 100, p.account, p.assignment]);
  const choices = book.addWorksheet('Sector choices');
  ['Auto', ...sectors].forEach(value => choices.addRow([value]));
  book.definedNames.add(`'Sector choices'!$A$1:$A$${sectors.length + 1}`, 'SectorChoices');
  choices.state = 'hidden';
  sheet.autoFilter = `A1:M${Math.max(1, sheet.rowCount)}`;
  sheet.columns.forEach((column, i) => { column.width = [23, 48, 26, 15, 29, 29][i] || 18; });
  sheet.getColumn(14).hidden = true;
  sheet.getColumn(15).hidden = true;
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = sheet.getCell(r, 6);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    cell.dataValidation = { type: 'list', allowBlank: false, formulae: ['SectorChoices'], showErrorMessage: true, errorTitle: 'Choose a sector', error: 'Select a sector from the dropdown, or Auto.' };
    for (const c of [8, 9, 10, 11, 12]) sheet.getCell(r, c).numFmt = '#,##0.00;[Red](#,##0.00)';
    sheet.getCell(r, 13).numFmt = '0.00%';
  }
  const notes = book.addWorksheet('Instructions');
  notes.getColumn(1).width = 115;
  [
    'Edit only the yellow Sector Assignment cells on Positions. Auto restores the brokerage/default classification.',
    'Every holding is exported separately, including option legs inside collapsed groups. The account selection controls which holdings are exported.',
    'Save as .xlsx, then use Import sector changes on the Positions page. Only changed assignments are applied; omitted rows are left alone.',
    'Keep Symbol and the hidden identity columns intact. Re-export if positions or sector assignments have changed since this export.',
    'After importing, click Save sector assignments, leave the download in Downloads, then run Publish Barker Dashboard on the desktop to update the shared website.',
  ].forEach(text => notes.addRow([text]));
  return book.xlsx.writeBuffer();
}

export async function readPositionSectorChanges(buffer, current, sectors) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet('Positions');
  if (!sheet || headers.some((header, i) => sheet.getCell(1, i + 1).value !== header)) throw new Error('Use an unchanged Positions Excel export from this dashboard.');
  const valid = new Set(['Auto', ...sectors]);
  const byKey = new Map(current.map(p => [JSON.stringify([p.account, p.symbol]), p]));
  const seen = new Map();
  const changes = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const value = c => { const v = row.getCell(c).value; if (v == null) return ''; if (typeof v !== 'string') throw new Error(`Row ${n}: identity and sector cells must contain plain text.`); return v.trim(); };
    const symbol = value(1), account = value(14), assignment = value(6), original = value(15);
    if (!symbol && !account && !assignment) return;
    if (!valid.has(assignment) || !valid.has(original)) throw new Error(`Row ${n}: choose a valid sector or Auto.`);
    const key = JSON.stringify([account, symbol]);
    const position = byKey.get(key);
    if (!position) throw new Error(`Row ${n}: holding no longer matches the dashboard. Export a fresh workbook.`);
    if (seen.has(key)) { if (seen.get(key) !== assignment) throw new Error(`Row ${n}: conflicting assignments for the same holding.`); return; }
    seen.set(key, assignment);
    if (assignment === original) return;
    if (position.assignment !== original) throw new Error(`Row ${n}: sector changed since export. Export a fresh workbook.`);
    changes.push({ ...position, assignment });
  });
  return changes;
}
