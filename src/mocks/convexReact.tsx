import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { runAction, runMutation, runQuery } from './mockServer';
import { mockStore, type MockStore } from './mockStore';

const MockConvexContext = createContext<MockStore | null>(null);

export function ConvexProvider({
  children,
}: {
  children: ReactNode;
  client?: unknown;
}) {
  return <MockConvexContext.Provider value={mockStore}>{children}</MockConvexContext.Provider>;
}

const useMockStore = () => {
  const ctx = useContext(MockConvexContext);
  if (!ctx) {
    throw new Error('Mock ConvexProvider is missing.');
  }
  return ctx;
}

export function useQuery(ref: string, args?: any) {
  const store = useMockStore();
  const shouldSkip = args === 'skip';
  const subscribe = useCallback(
    (cb: () => void) => (shouldSkip ? () => {} : store.subscribe(cb)),
    [store, shouldSkip],
  );
  const state = useSyncExternalStore(subscribe, store.getState, store.getState);
  return useMemo(() => {
    if (shouldSkip) {
      return undefined;
    }
    return runQuery(state, ref, args);
  }, [state, ref, args, shouldSkip]);
}

export function useMutation(ref: string) {
  const store = useMockStore();
  return useCallback((args: any) => runMutation(store, ref, args), [store, ref]);
}

export function useAction(ref: string) {
  const store = useMockStore();
  return useCallback((args: any) => runAction(store, ref, args), [store, ref]);
}

export function useConvex() {
  const store = useMockStore();
  return store.client;
}

export class ConvexReactClient {
  constructor(_url: string, _options?: unknown) {}
}
