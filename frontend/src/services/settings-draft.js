export const DRAFT_KEY = 'barker-settings-draft-v1';
export const SETTINGS_FIELDS = ['sectorOverrides', 'sectorTargetsByAccount', 'accountDisplayNames'];
export function settingsOnly(state) { return Object.fromEntries(SETTINGS_FIELDS.map(key => [key,state?.[key] || {}])); }
export function stableSettings(state) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
  return JSON.stringify(stable(settingsOnly(state)));
}
export function rebaseSettingsDraft(draft, published) {
  const next = structuredClone(settingsOnly(published));
  const conflicts = [];
  for (const field of SETTINGS_FIELDS) {
    const base = draft.base?.[field] || {}, edited = draft.settings?.[field] || {}, latest = published?.[field] || {};
    for (const key of new Set([...Object.keys(base),...Object.keys(edited)])) {
      if (JSON.stringify(base[key]) === JSON.stringify(edited[key])) continue;
      if (JSON.stringify(base[key]) !== JSON.stringify(latest[key]) && JSON.stringify(edited[key]) !== JSON.stringify(latest[key])) { conflicts.push(`${field}: ${key}`); continue; }
      if (key in edited) next[field][key] = edited[key]; else delete next[field][key];
    }
  }
  return {settings:next,conflicts};
}
