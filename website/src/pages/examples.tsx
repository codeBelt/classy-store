import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

export default function ExamplesPage() {
  const demoUrl = useBaseUrl('/demos/index.html');

  return (
    <Layout title="Examples" description="Interactive classy-store examples">
      <iframe
        src={demoUrl}
        title="Classy Store Interactive Examples"
        style={{width: '100%', height: 'calc(100vh - 60px)', border: 'none'}}
      />
    </Layout>
  );
}
