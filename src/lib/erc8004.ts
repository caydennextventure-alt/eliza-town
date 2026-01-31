// Minimal ERC-8004 identity helpers for Eliza Town (Sepolia-first).
// Keep this small and agent0-compatible so we can swap in agent0-sdk later.

export type ChainId = 1 | 11155111;

export const ERC8004_IDENTITY_REGISTRY: Record<ChainId, `0x${string}`> = {
  1: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  11155111: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};

export const ERC721_ABI_MIN = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function formatAgentId(chainId: number, tokenId: number | bigint): string {
  return `${chainId}:${tokenId.toString()}`;
}

export function parseAgentId(agentId: string): { chainId: number; tokenId: bigint } {
  const parts = agentId.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid agentId "${agentId}". Expected "chainId:tokenId".`);
  }
  const chainId = Number(parts[0]);
  if (!Number.isFinite(chainId)) throw new Error(`Invalid chainId in agentId: ${agentId}`);
  const tokenId = BigInt(parts[1]);
  return { chainId, tokenId };
}

export type ERC8004Registration = {
  type: string;
  name?: string;
  description?: string;
  image?: string;
  active?: boolean;
  x402Support?: boolean;
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  // Allow extensions
  [k: string]: unknown;
};

export async function fetchRegistrationFromTokenURI(tokenURI: string): Promise<ERC8004Registration | null> {
  if (!tokenURI || tokenURI.trim() === '') return null;

  // Support data:application/json;base64,... used in some guides.
  if (tokenURI.startsWith('data:')) {
    const comma = tokenURI.indexOf(',');
    if (comma === -1) return null;
    const meta = tokenURI.slice(0, comma);
    const data = tokenURI.slice(comma + 1);
    if (meta.includes('base64')) {
      // Browser-safe base64 decode
      const json = atob(data);
      return JSON.parse(json);
    }
    // If not base64, try URI-decoding.
    return JSON.parse(decodeURIComponent(data));
  }

  // HTTP(S) or ipfs://
  let url = tokenURI;
  if (url.startsWith('ipfs://')) {
    // simple public gateway fallback
    url = `https://ipfs.io/ipfs/${url.slice('ipfs://'.length)}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch registration from tokenURI (${res.status})`);
  return (await res.json()) as ERC8004Registration;
}
