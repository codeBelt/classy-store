import type {MetadataRoute} from 'next';
import {exampleSource} from '@/lib/example-source';
import {canonicalUrl} from '@/lib/shared';
import {source} from '@/lib/source';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    ...source.getPages().map((p) => p.url),
    ...exampleSource.getPages().map((p) => p.url),
  ];
  return paths.map((path) => ({url: canonicalUrl(path)}));
}
