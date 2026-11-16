import {siteUrl} from '@/lib/shared';
import {docsLlms} from '@/lib/source';

export const revalidate = false;

export function GET() {
  const index = docsLlms.index().replaceAll('](/docs', `](${siteUrl}/docs`);
  return new Response(
    `${index}\n\n[Complete documentation](${siteUrl}/llms-full.txt)\n`,
  );
}
