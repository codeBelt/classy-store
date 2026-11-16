import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import {createRelativeLink} from 'fumadocs-ui/mdx';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getMDXComponents} from '@/components/mdx';
import {MovedSections} from '@/components/moved-sections';
import {getPageImageUrl, getPageMarkdownUrl, gitConfig} from '@/lib/shared';
import {source} from '@/lib/source';
import {RackStrip} from '@/signal/instruments';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = `${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}${getPageMarkdownUrl(page).url}`;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <RackStrip
        src={
          process.env.NEXT_PUBLIC_DOCS_BASE_PATH +
          '/instruments/signal-strip.webp'
        }
      />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/website/content/docs/${page.path}`}
        />
      </div>
      <DocsBody
        className={
          page.slugs[0] === 'REACT_SCOPING' ? 'scope-guide' : undefined
        }
      >
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
        {page.slugs.length === 0 && (
          <MovedSections
            sections={['API_REFERENCE', 'PATTERNS', 'ABOUT'].flatMap((slug) => {
              const target = source.getPage([slug]);
              return (
                target?.data.toc.map((heading) => ({
                  hash: heading.url,
                  path: target.url,
                  title: heading.title,
                })) ?? []
              );
            })}
          />
        )}
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
