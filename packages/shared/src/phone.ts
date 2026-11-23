/**
 * Zambian mobile numbers: one place for normalising to E.164 (+260…), detecting the network,
 * and masking for logs (CLAUDE.md money rule 11).
 *
 * Prefixes from SPEC.md: MTN 096/076, Airtel 097/077, Zamtel 095/075.
 * TODO(A-13): confirm the current ranges with each operator before launch.
 */
export type Network = 'MTN' | 'AIRTEL' | 'ZAMTEL';

const PREFIX_TO_NETWORK: Record<string, Network> = {
  '96': 'MTN',
  '76': 'MTN',
  '97': 'AIRTEL',
  '77': 'AIRTEL',
  '95': 'ZAMTEL',
  '75': 'ZAMTEL',
};

export const NETWORK_NAME: Record<Network, string> = {
  MTN: 'MTN',
  AIRTEL: 'Airtel',
  ZAMTEL: 'Zamtel',
};

/** The 9-digit national number (e.g. "961234567"), or null. */
function nationalNumber(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '');
  let rest: string;
  if (/^\+260\d+$/.test(s)) rest = s.slice(4);
  else if (/^00260\d+$/.test(s)) rest = s.slice(5);
  else if (/^260\d{9}$/.test(s)) rest = s.slice(3);
  else if (/^0\d+$/.test(s)) rest = s.slice(1);
  else if (/^\d{9}$/.test(s)) rest = s;
  else return null;
  return /^\d{9}$/.test(rest) ? rest : null;
}

/** Any common way of writing a Zambian mobile number → "+260961234567", or null if it isn't one. */
export function normaliseZambianMobile(input: string): string | null {
  const nsn = nationalNumber(input);
  if (!nsn || !PREFIX_TO_NETWORK[nsn.slice(0, 2)]) return null;
  return `+260${nsn}`;
}

/** The network from the first digits, while the person is still typing. Null until known. */
export function detectNetwork(input: string): Network | null {
  const digits = input.replace(/\D/g, '');
  let rest = digits;
  if (digits.startsWith('260')) rest = digits.slice(3);
  else if (digits.startsWith('0')) rest = digits.slice(1);
  return PREFIX_TO_NETWORK[rest.slice(0, 2)] ?? null;
}

/** "+260961234567" → "096 123 4567" for display. */
export function formatLocalMobile(e164: string): string {
  const nsn = nationalNumber(e164);
  if (!nsn) return e164;
  return `0${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5)}`;
}

/** "+260961234567" → "+26096***567". The only form a phone number may take in logs. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '***';
  return `${e164.slice(0, 6)}***${e164.slice(-3)}`;
}
