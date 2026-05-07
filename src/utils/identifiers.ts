export function assertSafeIdentifier(name: string, label = "identifier"): void {
  // Allow typical DB identifiers only; prevents SQL injection via dynamic identifiers.
  // Note: you may extend this if your DB uses quoted identifiers with other chars.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

