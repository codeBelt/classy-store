import {withDocsBasePath} from '@/lib/shared';
import {docsLlms} from '@/lib/source';

export const revalidate = false;

export async function GET() {
  return new Response(withDocsBasePath(await docsLlms.full()));
}
