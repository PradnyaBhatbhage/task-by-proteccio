export function fmtNum(value: unknown) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString();
}

export function fmtPct01(value: unknown) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

export function titleize(value: unknown) {
  return String(value ?? "-").replace(/_/g, " ");
}
