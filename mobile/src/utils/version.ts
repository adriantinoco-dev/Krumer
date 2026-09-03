function parseVersion(version: string): [number, number, number] {
  const normalized = version.trim().replace(/^v/i, '');
  const parts = normalized.split('.');
  return [
    parseInt(parts[0], 10) || 0,
    parseInt(parts[1], 10) || 0,
    parseInt(parts[2], 10) || 0,
  ];
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function isNewerVersion(latest: string, current: string): boolean {
  const [lMaj, lMin, lPat] = parseVersion(latest);
  const [cMaj, cMin, cPat] = parseVersion(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
