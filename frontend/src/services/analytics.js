// Cash flows are signed: deposits positive, withdrawals negative, at end of day.
export function adjustKnownCashFlows(history, flows = []) {
  const byDate = new Map();
  for (const flow of flows) byDate.set(flow.date, (byDate.get(flow.date) || 0) + flow.amount);
  let index=1;
  return history.map(([date,nav],i)=>{
    const previous=i ? history[i-1][1] : null;
    const flow=byDate.get(date)||0;
    if (i && previous>0) index*= (nav-flow)/previous;
    return {date,nav,twr:index,external_flow:flow,return_method:'known_flows_adjusted',cash_flow_coverage:'partial'};
  });
}
export function sectorWeights(netValue, nav, grossInvested, benchmarkWeight) {
  const actualWeight=nav>0 ? netValue/nav*100 : null;
  return {actualWeight,activeWeight:actualWeight===null ? null : actualWeight-benchmarkWeight,
    investedWeight:grossInvested>0 ? netValue/grossInvested*100 : null};
}
