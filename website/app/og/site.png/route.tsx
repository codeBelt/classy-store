import {generateOGImage} from 'fumadocs-ui/og';
import {appName} from '@/lib/shared';

export const revalidate = false;

export function GET() {
  return generateOGImage({
    title: appName,
    site: '@codebelt/classy-store',
    description: 'Class-based state management for TypeScript.',
  });
}
