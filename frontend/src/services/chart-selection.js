export function accountSelection(names, enabled) {
  return {aggregate:false, spx:false, accounts:Object.fromEntries(names.map(name=>[name,enabled]))};
}
export function dateRange(series, start, end) {
  if (start && end && start>end) return [];
  return series.filter(([date])=>(!start || date>=start)&&(!end || date<=end));
}
export function selectedDefinitions(definitions, selection) {
  return definitions.filter(series=>series.key==='__portfolio__' ? selection.aggregate : series.key==='__spx__' ? selection.spx : selection.accounts?.[series.accountName]);
}
