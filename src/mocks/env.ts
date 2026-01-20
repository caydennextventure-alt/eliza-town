export const isE2E =
  import.meta.env.VITE_E2E_MOCKS === 'true' || import.meta.env.VITE_E2E_MOCKS === '1';
