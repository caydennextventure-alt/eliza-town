import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import {
  ERC721_ABI_MIN,
  ERC8004_IDENTITY_REGISTRY,
  fetchRegistrationFromTokenURI,
  parseAgentId,
  type ERC8004Registration,
} from '../lib/erc8004';

const DEFAULT_CHAIN_ID = 11155111;

export default function Erc8004OnboardingPage() {
  const [agentIdInput, setAgentIdInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{
    owner?: string;
    tokenURI?: string;
    registration?: ERC8004Registration | null;
  } | null>(null);

  const publicClient = useMemo(() => {
    // For now: public RPC fallback. Robin can provide a dedicated RPC later.
    return createPublicClient({ chain: sepolia, transport: http() });
  }, []);

  const onLookup = async () => {
    setStatus(null);
    setResult(null);

    const raw = agentIdInput.trim();
    if (!raw) {
      setStatus('Enter an agentId in the format chainId:tokenId (e.g. 11155111:123).');
      return;
    }

    let chainId: number;
    let tokenId: bigint;
    try {
      ({ chainId, tokenId } = parseAgentId(raw));
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
      return;
    }

    if (chainId !== DEFAULT_CHAIN_ID) {
      setStatus(`Only Sepolia (11155111) is supported in v1. You entered chainId=${chainId}.`);
      return;
    }

    const registry = ERC8004_IDENTITY_REGISTRY[11155111];

    try {
      setStatus('Reading owner/tokenURI from chain…');
      const owner = await publicClient.readContract({
        address: registry,
        abi: ERC721_ABI_MIN,
        functionName: 'ownerOf',
        args: [tokenId],
      });

      const tokenURI = await publicClient.readContract({
        address: registry,
        abi: ERC721_ABI_MIN,
        functionName: 'tokenURI',
        args: [tokenId],
      });

      setStatus('Fetching registration JSON from tokenURI…');
      const registration = await fetchRegistrationFromTokenURI(tokenURI).catch(() => null);

      setResult({ owner, tokenURI, registration });
      setStatus(null);
    } catch (e: any) {
      setStatus(e?.shortMessage ?? e?.message ?? String(e));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold">ERC-8004 Onboarding</h1>
          <Link to="/ai-town/" className="text-white/70 hover:text-white underline">
            Back to Eliza Town
          </Link>
        </div>

        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
          <h2 className="text-lg font-semibold mb-2">Link an existing ERC-8004 agent (Sepolia)</h2>
          <p className="text-white/70 mb-4">
            Enter <code className="text-white">chainId:tokenId</code>.
          </p>

          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded bg-black/40 border border-white/15"
              placeholder="11155111:123"
              value={agentIdInput}
              onChange={(e) => setAgentIdInput(e.target.value)}
            />
            <button
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500"
              onClick={() => void onLookup()}
            >
              Lookup
            </button>
          </div>

          {status && <div className="mt-3 text-amber-200">{status}</div>}

          {result && (
            <div className="mt-4 text-white/80 space-y-2">
              <div>
                <b>Owner:</b> <code>{result.owner}</code>
              </div>
              <div>
                <b>tokenURI:</b> <code className="break-all">{result.tokenURI}</code>
              </div>
              <div>
                <b>Registration:</b>
                <pre className="mt-2 p-3 bg-black/40 rounded border border-white/10 overflow-auto text-xs">
                  {JSON.stringify(result.registration, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-white/70">
          <h2 className="text-lg font-semibold mb-2">Mint a new ERC-8004 identity</h2>
          <p>
            Coming next: wallet connect + on-chain register() on Sepolia (user pays gas) + faucet link.
          </p>
        </div>

        <div className="mt-6">
          <Link to="/ai-town/moltbook" className="underline text-white">
            Moltbook Playbook →
          </Link>
        </div>
      </div>
    </div>
  );
}
