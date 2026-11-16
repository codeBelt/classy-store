import {DocsLayout} from 'fumadocs-ui/layouts/docs';
import {exampleSource} from '@/lib/example-source';
import {baseOptions} from '@/lib/layout.shared';
import './examples.css';

export default function Layout({children}: LayoutProps<'/examples'>) {
  return (
    <DocsLayout {...baseOptions()} tree={exampleSource.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
