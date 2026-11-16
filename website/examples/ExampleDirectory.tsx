import Link from 'next/link';
import {exampleSource} from '@/lib/example-source';
import {BenchScope} from '@/signal/instruments';

export function ExampleDirectory() {
  const groups: {
    name: string;
    pages: ReturnType<typeof exampleSource.getPages>;
  }[] = [];
  for (const node of exampleSource.getPageTree().children) {
    if (node.type === 'separator')
      groups.push({name: String(node.name), pages: []});
    if (node.type === 'page') {
      const page = exampleSource.getNodePage(node);
      if (page?.slugs.length) groups.at(-1)?.pages.push(page);
    }
  }
  return (
    <div className="not-prose">
      <Link className="featured-demo" href="/examples/reactivity/">
        <div className="featured-copy">
          <h2>Reactivity</h2>
          <p>Change a value and watch its subscribers respond.</p>
          <span className="lab-primary">Open demo →</span>
        </div>
        <BenchScope
          src={`${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/instruments/bench-scope.webp`}
          samples={[0, 1, 2]}
          value={2}
        />
      </Link>
      <div className="example-directory">
        {groups.map((group) => (
          <section key={group.name}>
            <h2>{group.name}</h2>
            <div>
              {group.pages.map((page) => (
                <Link key={page.url} href={page.url}>
                  <strong>{page.data.title} →</strong>
                  <span>{page.data.description}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
