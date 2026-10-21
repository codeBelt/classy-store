import Link from 'next/link';

export function Navigation() {
  return (
    <nav>
      <Link href="/" data-testid="link-home" prefetch={false}>
        Home
      </Link>{' '}
      <Link href="/workspace/alpha" data-testid="link-alpha" prefetch={false}>
        Alpha
      </Link>{' '}
      <Link href="/workspace/beta" data-testid="link-beta" prefetch={false}>
        Beta
      </Link>{' '}
      <Link href="/stream" data-testid="link-stream" prefetch={false}>
        Stream
      </Link>
    </nav>
  );
}
