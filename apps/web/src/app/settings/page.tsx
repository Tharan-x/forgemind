'use client';

import { redirect } from 'next/navigation';
import { useEffect } from 'react';

export default function SettingsRedirect() {
  useEffect(() => {
    redirect('/dashboard/settings');
  }, []);

  return null;
}
