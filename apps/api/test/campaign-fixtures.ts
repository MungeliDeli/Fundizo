import type { INestApplication } from '@nestjs/common';
import { OwnCampaignResponse } from '@fundizo/shared';
import type { App } from 'supertest/types.js';
import { browser, codeFrom, lastEmailTo, lastSmsTo, testJpeg } from './helpers.js';

let n = 0;

/**
 * A verified organiser with a published fundraiser, built through the real API (sign up, confirm
 * email and phone, fill the wizard, add a photo, publish). Fake details only.
 */
export async function publishedCampaign(app: INestApplication<App>) {
  n++;
  const email = `fixture${n}-${Date.now()}@example.test`;
  const phone = `097${String(1_000_000 + n).slice(-7)}`;
  const e164 = `+260${phone.slice(1)}`;
  const title = `Help the Phiri family with school fees ${n}`;
  const b = browser(app);
  await b
    .post('/auth/signup', {
      firstName: 'Ruth',
      lastName: 'Phiri',
      email,
      password: 'correct horse battery',
    })
    .expect(202);
  await b
    .post('/auth/verify-email', { email, code: codeFrom(await lastEmailTo(email)) })
    .expect(200);
  await b.post('/me/phone/code', { phone }).expect(202);
  await b.post('/me/phone/verify', { phone, code: codeFrom(await lastSmsTo(e164)) }).expect(200);

  const created = await b.post('/campaigns', { beneficiary: { kind: 'self' } }).expect(201);
  const { id } = OwnCampaignResponse.parse(created.body).campaign;
  await b.agent
    .patch(`/campaigns/${id}`)
    .set('x-fundizo-csrf', '1')
    .send({
      category: 'education',
      goalNgwee: 1_500_000,
      title,
      story: {
        whatHappened: 'Three children in Chipata need their school fees paid for the new term.',
        moneyFor: 'Fees, uniforms and books for the year.',
        extra: '',
      },
    })
    .expect(200);
  await b.agent
    .post(`/campaigns/${id}/photos`)
    .set('x-fundizo-csrf', '1')
    .set('Content-Type', 'image/jpeg')
    .send(await testJpeg())
    .expect(201);
  const published = await b.post(`/campaigns/${id}/publish`, {}).expect(200);
  const { slug } = OwnCampaignResponse.parse(published.body).campaign;
  if (!slug) throw new Error('not published');
  return { b, id, slug, title, email };
}
