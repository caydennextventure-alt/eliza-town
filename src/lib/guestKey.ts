const STORAGE_KEY = 'elizaTown.guestKey';

function generateGuestKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID() as string;
  }
  return `guest_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function getOrCreateGuestKey(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const next = generateGuestKey();
  window.localStorage.setItem(STORAGE_KEY, next);
  return next;
}

