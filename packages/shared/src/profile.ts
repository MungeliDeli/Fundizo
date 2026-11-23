import { z } from 'zod';
import { NAME_MAX } from './auth.js';
import { normaliseZambianMobile } from './phone.js';

/** Zambia's ten provinces. Districts are free text for now (a full list can replace it later). */
export const PROVINCES = [
  'Central',
  'Copperbelt',
  'Eastern',
  'Luapula',
  'Lusaka',
  'Muchinga',
  'Northern',
  'North-Western',
  'Southern',
  'Western',
] as const;
export const Province = z.enum(PROVINCES);
export type Province = z.infer<typeof Province>;

/** Languages for emails and SMS. Only English is live; the rest arrive in Phase 2 (A-11). */
export const LANGUAGES = { en: 'English', bem: 'Bemba', nya: 'Nyanja', toi: 'Tonga' } as const;
export const Language = z.enum(['en', 'bem', 'nya', 'toi']);
export type Language = z.infer<typeof Language>;

export const DISTRICT_MAX = 60;

const Name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(NAME_MAX, `Keep your ${label} under ${NAME_MAX} characters.`);

/** PATCH /me/profile (A-02). District is optional; an empty string clears it. */
export const UpdateProfileRequest = z
  .object({
    firstName: Name('first name'),
    lastName: Name('last name'),
    province: Province.nullable(),
    district: z
      .string()
      .trim()
      .max(DISTRICT_MAX, `Keep the district under ${DISTRICT_MAX} characters.`)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    language: Language,
  })
  .strict();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export const PhoneNumber = z
  .string()
  .trim()
  .max(20)
  .transform((v, ctx) => {
    const e164 = normaliseZambianMobile(v);
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a Zambian mobile number, like 096 123 4567.',
      });
      return z.NEVER;
    }
    return e164;
  });

/** POST /me/phone/code: send a code to this number (A-13). */
export const SendPhoneCodeRequest = z.object({ phone: PhoneNumber }).strict();
export type SendPhoneCodeRequest = z.infer<typeof SendPhoneCodeRequest>;

export const PHONE_CODE_LENGTH = 6;

/** POST /me/phone/verify: confirm the number with the code we texted. */
export const VerifyPhoneRequest = z
  .object({
    phone: PhoneNumber,
    code: z
      .string()
      .trim()
      .regex(
        new RegExp(`^\\d{${PHONE_CODE_LENGTH}}$`),
        `Enter the ${PHONE_CODE_LENGTH}-digit code.`,
      ),
  })
  .strict();
export type VerifyPhoneRequest = z.infer<typeof VerifyPhoneRequest>;
