import { describe, expect, it } from 'vitest';
import { makeSlug } from './slugs.js';

describe('makeSlug', () => {
  it('makes a readable, short address with a random ending', () => {
    expect(makeSlug('Help Mary get her heart surgery!')).toMatch(
      /^help-mary-get-her-heart-surgery-[2-9a-z]{4}$/,
    );
    expect(makeSlug('Ndalama za Malipiro – Chipatala')).toMatch(
      /^ndalama-za-malipiro-chipatala-[2-9a-z]{4}$/,
    );
  });
  it('copes with titles that have no letters', () => {
    expect(makeSlug('!!!')).toMatch(/^fundraiser-[2-9a-z]{4}$/);
  });
  it('stays short', () => {
    expect(makeSlug('a'.repeat(200)).length).toBeLessThanOrEqual(55);
  });
});
