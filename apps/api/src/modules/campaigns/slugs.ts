import { randomInt } from 'node:crypto';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/o, 1/l/i: easy to read aloud

/** "Help Mary get her heart surgery!" → "help-mary-get-her-heart-surgery-k3x9". */
export function makeSlug(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return base ? `${base}-${suffix}` : `fundraiser-${suffix}`;
}
