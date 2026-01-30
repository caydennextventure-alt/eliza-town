import { toast } from 'react-toastify';

function buildHelpfulErrorMessage(message: string): string {
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const lower = message.toLowerCase();
  const looksLikeAuth =
    lower.includes('not logged in') ||
    lower.includes('please log in') ||
    lower.includes('log in to');

  if (looksLikeAuth && !clerkEnabled) {
    return `${message}\n\nAuth is not configured in this dev build.\n- To enable login: set VITE_CLERK_PUBLISHABLE_KEY (frontend) and configure convex/auth.config.ts (backend).\n- To unblock local editing without login: set ALLOW_UNAUTHENTICATED_TOWN_EDIT=1 (Convex env).`;
  }

  return message;
}

export async function toastOnError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Something went wrong';
    toast.error(buildHelpfulErrorMessage(message));
    throw error;
  }
}
