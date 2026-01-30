import { useEffect, useState } from 'react';

type InteriorAsset = {
  id: string;
  name?: string;
  image: string;
  category?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  anchor?: 'top-left' | 'bottom-left' | 'center';
};

type InteriorManifest = {
  objects?: InteriorAsset[];
};

// Vite `base` is set to `/ai-town` for production, but in dev the app is usually served at `/`.
// Using `/ai-town` in dev makes fetching manifests/assets fail.
const RAW_BASE_PATH = (import.meta.env.DEV ? '/' : import.meta.env.BASE_URL) ?? '/';
const BASE_PATH = RAW_BASE_PATH.endsWith('/') ? RAW_BASE_PATH : `${RAW_BASE_PATH}/`;
const INTERIOR_MANIFEST_URL = `${BASE_PATH}assets/interior/interior-assets.json`;

const resolveImageUrl = (image: string) => {
  if (!image) return '';
  if (image.startsWith('http') || image.startsWith('data:')) return image;
  if (image.startsWith('/')) return image;
  // encodeURI keeps `/` but escapes spaces and other characters.
  return `${BASE_PATH}${encodeURI(image)}`;
};

export function useInteriorAssets() {
  const [assets, setAssets] = useState<InteriorAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        console.log('Loading interior assets from:', INTERIOR_MANIFEST_URL);
        const res = await fetch(INTERIOR_MANIFEST_URL, { cache: 'no-cache' });

        if (!res.ok) {
          throw new Error(`Failed to load interior assets (${res.status})`);
        }

        const json = (await res.json()) as InteriorManifest;
        const objects = json.objects ?? [];

        // Add base path to image URLs
        const withBasePath = objects.map((obj) => ({
          ...obj,
          image: resolveImageUrl(obj.image),
        }));

        console.log('Loaded', withBasePath.length, 'interior assets');

        if (!cancelled) {
          setAssets(withBasePath);
          setLoading(false);
        }
      } catch (e: any) {
        console.error('Failed to load interior assets:', e);
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load interior assets');
          setLoading(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // Group by category
  const byCategory = (category: string) => assets.filter((a) => a.category === category);

  return {
    assets,
    loading,
    error,
    floor: byCategory('floor'),
    furniture: byCategory('furniture'),
    deco: byCategory('deco'),
  };
}
