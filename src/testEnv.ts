export const isTestMode =
  import.meta.env.VITE_E2E === 'true' || import.meta.env.VITE_E2E === '1';
