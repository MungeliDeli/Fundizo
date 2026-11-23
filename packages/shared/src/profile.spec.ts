import { describe, expect, it } from 'vitest';
import { SendPhoneCodeRequest, UpdateProfileRequest, VerifyPhoneRequest } from './profile.js';

const valid = {
  firstName: ' Mary ',
  lastName: 'Banda',
  province: 'Central',
  district: ' Kabwe ',
  language: 'en',
};

describe('UpdateProfileRequest', () => {
  it('trims and accepts a full profile', () => {
    expect(UpdateProfileRequest.parse(valid)).toEqual({
      firstName: 'Mary',
      lastName: 'Banda',
      province: 'Central',
      district: 'Kabwe',
      language: 'en',
    });
  });

  it('treats an empty district as none, and allows no province', () => {
    expect(UpdateProfileRequest.parse({ ...valid, province: null, district: '  ' })).toMatchObject({
      province: null,
      district: null,
    });
  });

  it('rejects unknown provinces, languages and fields', () => {
    expect(UpdateProfileRequest.safeParse({ ...valid, province: 'Gauteng' }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ ...valid, language: 'fr' }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ ...valid, phone: '+260961234567' }).success).toBe(
      false,
    );
  });
});

describe('phone requests', () => {
  it('normalises the number', () => {
    expect(SendPhoneCodeRequest.parse({ phone: '097 123 4567' })).toEqual({
      phone: '+260971234567',
    });
  });
  it('explains a bad number in plain words', () => {
    const r = SendPhoneCodeRequest.safeParse({ phone: '12345' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/Zambian mobile number/);
  });
  it('needs a 6-digit code', () => {
    expect(VerifyPhoneRequest.safeParse({ phone: '0961234567', code: '12345' }).success).toBe(
      false,
    );
    expect(VerifyPhoneRequest.parse({ phone: '0961234567', code: ' 123456 ' })).toEqual({
      phone: '+260961234567',
      code: '123456',
    });
  });
});
