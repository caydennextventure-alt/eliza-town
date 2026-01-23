import { ConvexReactClient, useConvex } from 'convex/react';
import { InputArgs, InputReturnValue, Inputs } from '../../convex/aiTown/inputs';
import { api } from 'convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

type WaitForInputOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export async function waitForInput(
  convex: ConvexReactClient,
  inputId: Id<'inputs'>,
  options?: WaitForInputOptions,
) {
  const watch = convex.watchQuery(api.aiTown.main.inputStatus, { inputId });
  let result = watch.localQueryResult();
  // The result's undefined if the query's loading and null if the input hasn't
  // been processed yet.
  if (result === undefined || result === null) {
    let dispose: undefined | (() => void);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = options?.timeoutMs;
    try {
      const waitForResult = new Promise<void>((resolve, reject) => {
        dispose = watch.onUpdate(() => {
          try {
            result = watch.localQueryResult();
          } catch (e: any) {
            reject(e);
            return;
          }
          if (result !== undefined && result !== null) {
            resolve();
          }
        });
      });
      if (timeoutMs) {
        const timeoutPromise = new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                options?.timeoutMessage ?? `Timed out waiting for input ${inputId}.`,
              ),
            );
          }, timeoutMs);
        });
        await Promise.race([waitForResult, timeoutPromise]);
      } else {
        await waitForResult;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (dispose) {
        dispose();
      }
    }
  }
  if (!result) {
    throw new Error(`Input ${inputId} was never processed.`);
  }
  if (result.kind === 'error') {
    throw new Error(result.message);
  }
  return result.value;
}

export function useSendInput<Name extends keyof Inputs>(
  engineId: Id<'engines'>,
  name: Name,
): (args: InputArgs<Name>) => Promise<InputReturnValue<Name>> {
  const convex = useConvex();
  return async (args) => {
    const inputId = await convex.mutation(api.world.sendWorldInput, { engineId, name, args });
    return await waitForInput(convex, inputId);
  };
}
