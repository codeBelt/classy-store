import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getMDXComponents} from '@/components/mdx';
import {exampleSource} from '@/lib/example-source';
import {RackStrip} from '@/signal/instruments';

type Props = PageProps<'/examples/[[...slug]]'>;

export function generateStaticParams() {
  return exampleSource.generateParams();
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const page = exampleSource.getPage((await params).slug);
  if (!page) notFound();
  return {title: page.data.title, description: page.data.description};
}

export default async function ExamplePage({params}: Props) {
  const page = exampleSource.getPage((await params).slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.slugs.length === 0}>
      <RackStrip
        src={`${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/instruments/signal-strip.webp`}
      />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody className="example-main">
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
