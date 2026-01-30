import { useEffect, useState } from 'react';

type AssetsManifest = {
  objects?: Array<{
    id: string;
    name?: string;
    image: string;
    category?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    anchor?: 'top-left' | 'bottom-left' | 'center';
  }>;
};

// Same reasoning as useInteriorAssets: production is served under `/ai-town`, dev is usually `/`.
const RAW_BASE_PATH = (import.meta.env.DEV ? '/' : import.meta.env.BASE_URL) ?? '/';
const BASE_PATH = RAW_BASE_PATH.endsWith('/') ? RAW_BASE_PATH : `${RAW_BASE_PATH}/`;
const ASSETS_MANIFEST_URL = `${BASE_PATH}assets/assets.json`;

export function useAssetsManifest() {
  const [manifest, setManifest] = useState<AssetsManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        console.log('Fetching assets manifest from:', ASSETS_MANIFEST_URL);
        setError(null);
        const res = await fetch(ASSETS_MANIFEST_URL, { cache: 'no-cache' });
        console.log('Fetch response:', res.status, res.ok);
        if (!res.ok) {
          throw new Error(`Failed to load assets manifest (${res.status})`);
        }
        const json = (await res.json()) as AssetsManifest;
        console.log('Loaded manifest with', json.objects?.length ?? 0, 'objects');
        if (cancelled) return;
        setManifest(json);
      } catch (e: any) {
        console.error('Failed to load assets manifest:', e);
        if (cancelled) return;
        setError(e?.message ?? 'Failed to load assets manifest');
        setManifest(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, error };
}
