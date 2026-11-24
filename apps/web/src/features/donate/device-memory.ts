/**
 * What this device remembers for a donor (D-05: "number remembered on the device").
 * Storage can be missing or blocked (private mode), so every access is guarded.
 */
const PHONE = 'fz:donor-phone';
const NAME = 'fz:donor-name';
const TOKEN = (id: string) => `fz:donation-token:${id}`;

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}
function write(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}
const local = () => window.localStorage;

export const donorMemory = {
  phone: () => read(local, PHONE) ?? '',
  name: () => read(local, NAME) ?? '',
  remember(phone: string, name: string) {
    write(local, PHONE, phone);
    if (name) write(local, NAME, name);
  },
  /** The access token for a donation started on this device (kept so a reload still works). */
  token: (id: string) => read(local, TOKEN(id)),
  saveToken: (id: string, token: string) => write(local, TOKEN(id), token),
};
