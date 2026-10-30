export function periodSeries(series, start, end) {
  const rows=series.filter(([date,value])=>date && Number.isFinite(value)).sort((a,b)=>a[0].localeCompare(b[0]));
  if (!rows.length || start && end && start>end) return [];
  const finish=end && end<rows.at(-1)[0] ? end : rows.at(-1)[0];
  const selected=rows.filter(([date])=>(!start||date>=start)&&date<=finish);
  // Carry a known prior close to a weekend/holiday boundary, never backfill from a future close.
  if (start && start<=finish && !selected.some(([date])=>date===start)) {
    const previous=rows.filter(([date])=>date<start).at(-1);
    if (previous) selected.unshift([start,previous[1]]);
  }
  if (selected.length && end && end<=rows.at(-1)[0] && selected.at(-1)[0]<end) selected.push([end,selected.at(-1)[1]]);
  return selected;
}
export function businessSeries(series) {
  return series.filter(([date])=>{const day=new Date(date+'T12:00:00Z').getUTCDay();return day!==0&&day!==6;});
}
export function performanceMetrics(series, riskFreeRate=.043) {
  const empty={total:null,ytd:null,maxDrawdown:null,volatility:null,sharpe:null,calmar:null,currentNav:series.at(-1)?.[1]??null};
  if (series.length<2 || series.some(([,value])=>!Number.isFinite(value)||value<=0)) return empty;
  const first=series[0][1],last=series.at(-1)[1];
  const total=(last/first-1)*100;
  const year=series.at(-1)[0].slice(0,4), boundary=year+'-01-01';
  const baseline=series.filter(([date])=>date<boundary).at(-1) || series.find(([date])=>date>=boundary);
  const ytd=baseline?.[1]>0 ? (last/baseline[1]-1)*100 : null;
  let peak=first,dd=0;
  for (const [,value] of series) {peak=Math.max(peak,value);dd=Math.max(dd,(peak-value)/peak);}
  const trading=businessSeries(series),returns=trading.slice(1).map(([,v],i)=>v/trading[i][1]-1);
  const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null;
  const variance=returns.length>1 ? returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(returns.length-1):null;
  const dailySd=variance===null?null:Math.sqrt(variance),volatility=dailySd===null?null:dailySd*Math.sqrt(252)*100;
  const rfDaily=(1+riskFreeRate)**(1/252)-1;
  const sharpe=dailySd>0 ? (mean-rfDaily)/dailySd*Math.sqrt(252):null;
  const elapsed=(Date.parse(series.at(-1)[0])-Date.parse(series[0][0]))/86400000;
  const cagr=elapsed>0 ? (last/first)**(365.25/elapsed)-1:null;
  return {total,ytd,maxDrawdown:dd*100,volatility,sharpe,calmar:dd>0&&Number.isFinite(cagr)?cagr/dd:null,currentNav:last};
}
export function finiteOrNull(value) {return typeof value==='number'&&Number.isFinite(value)?value:null;}
export function derivativeExposure(position, underlyingPrice) {
  const type=String(position.assetType || position.asset_class || '').toLowerCase();
  const qty=Number(position.qty),multiplier=Number(position.multiplier);
  const premium=finiteOrNull(position.mktVal ?? position.market_value);
  if (type.includes('option')) return {basis:'premium',marketValue:premium,notional:null,deltaExposure:null};
  if (type.includes('future')) {
    const price=Number(position.price);
    return {basis:'contract notional',marketValue:premium,notional:Number.isFinite(qty)&&multiplier>0&&Number.isFinite(price)?qty*multiplier*price:null,deltaExposure:null};
  }
  return {basis:'market value',marketValue:premium,notional:premium,deltaExposure:null};
}
