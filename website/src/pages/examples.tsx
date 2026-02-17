import Layout from '@theme/Layout';

export default function ExamplesPage() {
  return (
    <Layout title="Examples" description="Interactive classy-store examples">
      <iframe
        src="/classy-store/demos/index.html"
        title="Classy Store Interactive Examples"
        style={{width: '100%', height: 'calc(100vh - 60px)', border: 'none'}}
      />
    </Layout>
  );
}
