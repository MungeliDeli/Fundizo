'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api';
import { formError } from './error-messages';

const Revoked = z.object({ revoked: z.number() });
const Empty = z.object({});

/** Log out, and log out of other devices (A-03). */
export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<'logout' | 'others' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function logout() {
    setBusy('logout');
    try {
      await apiPost('/auth/logout', {}, Empty);
    } finally {
      router.replace('/');
      router.refresh();
    }
  }

  async function logoutOthers() {
    setBusy('others');
    setMessage(null);
    try {
      const { revoked } = await apiPost('/auth/logout-others', {}, Revoked);
      setMessage({
        tone: 'success',
        text:
          revoked === 0
            ? 'You weren’t logged in anywhere else.'
            : `Logged out of ${revoked} other device${revoked === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      setMessage({ tone: 'error', text: formError(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="outline"
          size="md"
          onClick={logoutOthers}
          loading={busy === 'others'}
          disabled={busy !== null}
        >
          Log out of other devices
        </Button>
        <Button
          variant="ink"
          size="md"
          onClick={logout}
          loading={busy === 'logout'}
          disabled={busy !== null}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
