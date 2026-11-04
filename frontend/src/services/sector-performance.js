// Measured daily results require reconciled valuations and documented flow timing.
export function dailySectorPerformance({ openingValue, closingValue, capitalFlow = 0, income = 0, fees = 0, openingNav, reconciled = false, longOnly = true }) {
  if (!reconciled || ![openingValue, closingValue, capitalFlow, income, fees, openingNav].every(Number.isFinite) || openingNav <= 0) return { pnl:null, contribution:null, sectorReturn:null };
  const pnl = closingValue - openingValue - capitalFlow + income - fees;
  return { pnl, contribution:pnl / openingNav, sectorReturn:longOnly && openingValue > 0 ? pnl / openingValue : null };
}
export function linkDailyContributions(days) {
  // A prior day's accumulated portfolio wealth scales the following day's contribution.
  let wealth = 1;
  const contributions = {};
  for (const day of days) {
    if (!Number.isFinite(day.portfolioReturn) || !day.sectors || Object.values(day.sectors).some(value => !Number.isFinite(value))) return null;
    if (Math.abs(Object.values(day.sectors).reduce((sum,value) => sum + value,0) - day.portfolioReturn) > 1e-8) return null;
    for (const [sector,value] of Object.entries(day.sectors)) contributions[sector] = (contributions[sector] || 0) + wealth * value;
    wealth *= 1 + day.portfolioReturn;
  }
  return { totalReturn:wealth - 1, contributions };
}
