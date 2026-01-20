import { createMockState, getScenario, runMutation, runQuery, type MockState } from './mockServer';

type Listener = () => void;

type Client = {
  mutation: (ref: string, args: any) => Promise<any>;
  watchQuery: (ref: string, args: any) => {
    localQueryResult: () => any;
    onUpdate: (cb: () => void) => () => void;
  };
};

export type MockStore = {
  getState: () => MockState;
  setState: (next: MockState) => void;
  subscribe: (listener: Listener) => () => void;
  client: Client;
};

let state = createMockState(getScenario());
const listeners = new Set<Listener>();

const getState = () => state;
const setState = (next: MockState) => {
  state = next;
  for (const listener of listeners) {
    listener();
  }
};
const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const store: MockStore = {
  getState,
  setState,
  subscribe,
  client: {
    mutation: (ref: string, args: any) => runMutation(store, ref, args),
    watchQuery: (ref: string, args: any) => ({
      localQueryResult: () => runQuery(store.getState(), ref, args),
      onUpdate: (cb: () => void) => store.subscribe(cb),
    }),
  },
};

export const mockStore = store;
