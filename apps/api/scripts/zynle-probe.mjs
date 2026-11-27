// ZynlePay SANDBOX contract probe (slice 8). Talks to the real sandbox with the keys in apps/api/.env.
// Prints only response codes and descriptions; never the keys. Refuses anything but the sandbox.
//
//   pnpm --filter @fundizo/api zynle:probe                       check keys / IP with a status call
//   pnpm --filter @fundizo/api zynle:probe deposit 0971234567 10  send a sandbox deposit of "10"
//                                                                 (sent exactly as typed) and follow it
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const base = (
  process.env.ZYNLE_BASE_URL ?? 'https://sandbox.zynlepay.com/zynlepay/jsonapi'
).replace(/\/+$/, '');
const statusUrl = process.env.ZYNLE_STATUS_URL ?? `${base}/paymentstatus`;
for (const u of [base, statusUrl]) {
  if (new URL(u).hostname !== 'sandbox.zynlepay.com') {
    console.error('Refusing: this probe only talks to sandbox.zynlepay.com');
    process.exit(1);
  }
}
const missing = ['ZYNLE_MERCHANT_ID', 'ZYNLE_API_ID', 'ZYNLE_API_KEY'].filter(
  (k) => !process.env[k],
);
if (missing.length) {
  console.error(`Add these to apps/api/.env first: ${missing.join(', ')}`);
  process.exit(1);
}
const {
  ZYNLE_MERCHANT_ID: merchant_id,
  ZYNLE_API_ID: api_id,
  ZYNLE_API_KEY: api_key,
} = process.env;

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep text
  }
  return { http: res.status, json, text: json ? undefined : text.slice(0, 200) };
}

function show(label, r) {
  const safe = r.json ? { ...r.json } : r.text;
  if (safe && typeof safe === 'object')
    for (const k of ['api_key', 'api_id', 'merchant_id']) delete safe[k];
  console.log(`${label}: HTTP ${r.http}`, JSON.stringify(safe, null, 2));
}

const [mode, phone, amount] = process.argv.slice(2);
if (!mode) {
  const ref = randomUUID().replace(/-/g, '');
  const r = await post(statusUrl, { api_id, api_key, reference_no: ref });
  show('Status check for a made-up reference', r);
  const code = String(r.json?.response_code ?? '');
  if (code === '990')
    console.log('\n✓ Keys accepted and the sandbox answered ("not found" is expected here).');
  else if (code === '9902')
    console.log('\n✗ 9902: wrong API credentials, or this machine’s IP is not whitelisted.');
  else console.log('\n? Unexpected answer: please send this output (it contains no keys).');
} else if (mode === 'deposit' && phone && amount) {
  const ref = randomUUID().replace(/-/g, '');
  const r = await post(base, {
    auth: { merchant_id, api_id, api_key, channel: 'momo' },
    data: { method: 'runBillPayment', sender_id: phone, reference_no: ref, amount },
  });
  show(`Deposit (reference ${ref})`, r);
  for (const wait of [10, 20, 30, 60]) {
    await new Promise((res) => setTimeout(res, wait * 1000));
    show(`Status after +${wait}s`, await post(statusUrl, { api_id, api_key, reference_no: ref }));
  }
} else {
  console.error(
    'Usage: zynle:probe | zynle:probe deposit <phone as ZynlePay wants it> <amount as sent>',
  );
  process.exit(1);
}
