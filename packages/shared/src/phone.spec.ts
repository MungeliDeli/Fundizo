import { describe, expect, it } from 'vitest';
import { detectNetwork, formatLocalMobile, maskPhone, normaliseZambianMobile } from './phone.js';

describe('normaliseZambianMobile', () => {
  it.each([
    ['096 123 4567', '+260961234567'],
    ['0961234567', '+260961234567'],
    ['+260 97 123 4567', '+260971234567'],
    ['260771234567', '+260771234567'],
    ['00260761234567', '+260761234567'],
    ['961234567', '+260961234567'],
    ['(095) 123-4567', '+260951234567'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseZambianMobile(input)).toBe(expected);
  });

  it.each(['', '12345', '0911234567', '+254712345678', '09612345678', 'abc', '0211234567'])(
    'rejects %s',
    (input) => {
      expect(normaliseZambianMobile(input)).toBeNull();
    },
  );
});

describe('detectNetwork', () => {
  it('knows the network from the first digits', () => {
    expect(detectNetwork('096')).toBe('MTN');
    expect(detectNetwork('076 1')).toBe('MTN');
    expect(detectNetwork('097')).toBe('AIRTEL');
    expect(detectNetwork('+26077')).toBe('AIRTEL');
    expect(detectNetwork('095')).toBe('ZAMTEL');
  });
  it('waits until it knows', () => {
    expect(detectNetwork('0')).toBeNull();
    expect(detectNetwork('091')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats for people', () => expect(formatLocalMobile('+260961234567')).toBe('096 123 4567'));
  it('masks for logs', () => expect(maskPhone('+260961234567')).toBe('+26096***567'));
});
