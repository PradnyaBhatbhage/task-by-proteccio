import type { Confidence, DetectionMethod, DiscoveryFinding, SensitiveCategory } from "./types";
import { maskEmail, maskMiddle } from "./mask";
import { isValidLuhn } from "./validators/luhn";
import { isValidVerhoeff } from "./validators/verhoeff";

export interface LeafInput {
  path: string;
  key: string;
  /** Normalized string form of primitive values */
  text: string;
}

function finding(
  category: SensitiveCategory,
  methods: DetectionMethod[],
  path: string,
  confidence: Confidence,
  maskedSample?: string,
  valueLength?: number
): DiscoveryFinding {
  return { category, methods, path, confidence, maskedSample, valueLength };
}

const EMAIL_RE =
  /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?:\.[A-Za-z]{2,})\b/g;

/** Indian mobile and common international formats; avoids matching long digit-only IDs. */
const PHONE_RES: RegExp[] = [
  /\b\+91[\s-]?[6-9]\d{9}\b/g,
  /\b(?:\+1[\s-]?)?(?:\([0-9]{3}\)|[0-9]{3})[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}\b/g,
  /\b\+[1-9]\d{7,14}\b/g,
  /\b[6-9]\d{9}\b/g
];

const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

/** Conservative IPv6 (full segments only). */
const IPV6_RE =
  /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g;

const PAN_TOKEN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

/** Indian passport common machine-readable pattern + generic travel-doc shape (medium confidence). */
const PASSPORT_STRONG_RE = /\b[A-Z][0-9]{7}\b/g;
const PASSPORT_WEAK_RE = /\b[A-Z]{1,2}[0-9]{6,7}\b/g;

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{13,28}\b/g;

const AUTH_KEY_RE =
  /^(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|auth(?:entication)?|authorization|bearer)$/i;

const NAME_KEY_RE =
  /^(?:full_?name|first_?name|last_?name|given_?name|family_?name|customer_?name|contact_?name|employee_?name|patient_?name|holder_?name|beneficiary_?name|mother_?name|father_?name|maiden_?name)$/i;

const ADDRESS_KEY_RE =
  /^(?:address|street|addr(?:ess)?_?(?:line)?_?(?:1|2)?|postal|zip(?:code)?|pin(?:code)?|city|state|country)$/i;

const BANK_KEY_RE =
  /^(?:iban|bank_?account|account_?(?:no|number|num)|acct_?(?:no|number)|routing|ifsc|sort_?code)$/i;

const DOB_KEY_RE = /^(?:dob|date_?of_?birth|birth_?date|birthday)$/i;

function normalizePanScan(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

function ipv4Valid(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function extractDigitRuns(text: string, minLen: number, maxLen: number): string[] {
  const out: string[] = [];
  if (minLen < 2) return out;
  const innerMin = minLen - 2;
  const innerMax = maxLen - 2;
  const re = new RegExp(`\\d[\\d\\s\\-]{${innerMin},${innerMax}}\\d`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const compact = m[0].replace(/\D/g, "");
    if (compact.length >= minLen && compact.length <= maxLen) out.push(compact);
  }
  const compactOnly = text.match(new RegExp(`\\d{${minLen},${maxLen}}`, "g"));
  if (compactOnly) out.push(...compactOnly);
  return out;
}

function uniqueStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}

function looksLikePersonName(value: string): boolean {
  const t = value.trim();
  if (t.length < 3 || t.length > 100) return false;
  if (/\d/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s.'-]*[A-Za-z.]?$/.test(t);
}

function looksLikeAddress(value: string): boolean {
  const t = value.trim();
  if (t.length < 12 || t.length > 300) return false;
  if (/\b(?:true|false|null|undefined)\b/i.test(t)) return false;
  const score =
    (/\d/.test(t) ? 1 : 0) +
    (/[,#]/.test(t) ? 1 : 0) +
    (/\b(?:street|st\.|road|rd\.|lane|avenue|apt|suite|floor|city|pin|zip)\b/i.test(t) ? 2 : 0);
  return score >= 2;
}

function parseDobYear(text: string): number | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return Number(iso[1]);
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  if (dmy) return Number(dmy[3]);
  return undefined;
}

function isPlausibleDob(text: string): boolean {
  const y = parseDobYear(text.trim());
  if (y === undefined) return false;
  const current = new Date().getFullYear();
  return y >= 1900 && y <= current;
}

function jwtLike(text: string): boolean {
  const t = text.trim();
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) && t.length > 40;
}

/**
 * Runs all detectors on one flattened leaf. Multiple categories may apply.
 */
function resetLastIndex(re: RegExp): void {
  re.lastIndex = 0;
}

export function analyzeLeaf(leaf: LeafInput): DiscoveryFinding[] {
  const findings: DiscoveryFinding[] = [];
  const { path, key, text } = leaf;
  if (!text || text.length > 500_000) return findings;

  resetLastIndex(EMAIL_RE);
  resetLastIndex(IPV4_RE);
  resetLastIndex(IPV6_RE);
  resetLastIndex(PAN_TOKEN_RE);
  resetLastIndex(PASSPORT_STRONG_RE);
  resetLastIndex(PASSPORT_WEAK_RE);
  resetLastIndex(IBAN_RE);
  PHONE_RES.forEach(resetLastIndex);

  const upperScan = normalizePanScan(text);

  // Email
  for (const m of text.matchAll(EMAIL_RE)) {
    const raw = m[0];
    findings.push(
      finding("email", ["regex", "pattern"], path, "high", maskEmail(raw), raw.length)
    );
  }

  // Phone
  for (const re of PHONE_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const raw = m[0].replace(/\s+/g, " ").trim();
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) continue;
      findings.push(
        finding("phone", ["regex", "pattern"], path, "medium", maskMiddle(raw.replace(/\D/g, ""), 2, 2), raw.length)
      );
    }
  }

  // IPv4
  for (const m of text.matchAll(IPV4_RE)) {
    const raw = m[0];
    if (!ipv4Valid(raw)) continue;
    findings.push(finding("ip_address", ["regex"], path, "high", maskMiddle(raw, 3, 3), raw.length));
  }

  // IPv6
  for (const m of text.matchAll(IPV6_RE)) {
    const raw = m[0];
    findings.push(finding("ip_address", ["regex"], path, "medium", maskMiddle(raw, 4, 4), raw.length));
  }

  // Payment card (Luhn)
  const cardCandidates = uniqueStrings(extractDigitRuns(text, 13, 19));
  for (const compact of cardCandidates) {
    if (!isValidLuhn(compact)) continue;
    const first = compact[0];
    if (first === "0") continue;
    findings.push(
      finding(
        "payment_card",
        ["regex", "rule_validation"],
        path,
        "high",
        maskMiddle(compact, 0, 4),
        compact.length
      )
    );
  }

  // Aadhaar — UIDAI first digit not 0/1; Verhoeff reduces false positives.
  const aadhaarRuns = text.match(/\b[2-9]\d{11}\b/g) ?? [];
  for (const raw of aadhaarRuns) {
    if (!isValidVerhoeff(raw)) continue;
    findings.push(
      finding(
        "aadhaar",
        ["regex", "rule_validation"],
        path,
        "high",
        maskMiddle(raw, 0, 4),
        raw.length
      )
    );
  }

  // PAN
  for (const m of upperScan.matchAll(PAN_TOKEN_RE)) {
    const raw = m[0];
    findings.push(
      finding("pan", ["regex", "rule_validation"], path, "high", maskMiddle(raw, 2, 1), raw.length)
    );
  }

  // Passport
  for (const m of upperScan.matchAll(PASSPORT_STRONG_RE)) {
    const raw = m[0];
    findings.push(finding("passport", ["regex"], path, "medium", maskMiddle(raw, 2, 2), raw.length));
  }
  if (!findings.some((f) => f.category === "passport")) {
    const panShape = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    for (const m of upperScan.matchAll(PASSPORT_WEAK_RE)) {
      const raw = m[0];
      if (panShape.test(raw)) continue;
      findings.push(finding("passport", ["pattern"], path, "low", maskMiddle(raw, 2, 2), raw.length));
    }
  }

  // IBAN + bank account hints
  for (const m of upperScan.matchAll(IBAN_RE)) {
    const raw = m[0].replace(/\s/g, "");
    findings.push(
      finding("bank_account", ["regex", "pattern"], path, "high", maskMiddle(raw, 4, 4), raw.length)
    );
  }
  if (BANK_KEY_RE.test(key)) {
    for (const compact of uniqueStrings(extractDigitRuns(text, 9, 18))) {
      if (isValidLuhn(compact)) continue;
      findings.push(
        finding(
          "bank_account",
          ["keyword", "pattern"],
          path,
          "medium",
          maskMiddle(compact, 0, 3),
          compact.length
        )
      );
    }
  }

  // Date of birth
  const dobCandidates = [
    ...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
    ...text.matchAll(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/g)
  ];
  for (const m of dobCandidates) {
    const raw = m[0];
    if (!isPlausibleDob(raw)) continue;
    const methods: DetectionMethod[] = DOB_KEY_RE.test(key) ? ["regex", "keyword"] : ["regex"];
    const conf: Confidence = DOB_KEY_RE.test(key) ? "high" : "medium";
    findings.push(finding("date_of_birth", methods, path, conf, maskMiddle(raw, 2, 2), raw.length));
  }

  // Authentication-related (field name or JWT-shaped value)
  if (AUTH_KEY_RE.test(key)) {
    findings.push(
      finding(
        "authentication_field",
        ["keyword"],
        path,
        "high",
        maskMiddle(text, 0, 2),
        text.length
      )
    );
  }
  if (jwtLike(text)) {
    findings.push(
      finding("authentication_field", ["pattern"], path, "high", maskMiddle(text, 8, 8), text.length)
    );
  }

  // Names & addresses — conservative: require column/key hints to limit false positives.
  if (NAME_KEY_RE.test(key) && looksLikePersonName(text)) {
    findings.push(
      finding(
        "person_name",
        ["keyword", "pattern"],
        path,
        "medium",
        maskMiddle(text.trim(), 2, 2),
        text.trim().length
      )
    );
  }

  if (ADDRESS_KEY_RE.test(key) && looksLikeAddress(text)) {
    findings.push(
      finding(
        "address",
        ["keyword", "pattern"],
        path,
        "medium",
        maskMiddle(text.trim(), 4, 4),
        text.trim().length
      )
    );
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: DiscoveryFinding[]): DiscoveryFinding[] {
  const map = new Map<string, DiscoveryFinding>();
  for (const f of findings) {
    const k = `${f.category}::${f.path}::${f.maskedSample ?? ""}`;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...f, methods: [...f.methods] });
    } else {
      const merged = new Set<DetectionMethod>([...existing.methods, ...f.methods]);
      existing.methods = [...merged];
      if (rank(existing.confidence) < rank(f.confidence)) {
        existing.confidence = f.confidence;
        existing.maskedSample = f.maskedSample ?? existing.maskedSample;
      }
    }
  }
  return [...map.values()];
}

function rank(c: Confidence): number {
  if (c === "high") return 3;
  if (c === "medium") return 2;
  return 1;
}

/**
 * Coerce any leaf value to inspection text (never recurse here — flatten handles nesting).
 */
export function leafValueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return "";
}
