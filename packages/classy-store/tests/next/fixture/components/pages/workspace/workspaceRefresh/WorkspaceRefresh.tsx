'use client';

import {useRouter} from 'next/navigation';

export function WorkspaceRefresh() {
  const router = useRouter();
  return (
    <button
      type="button"
      data-testid="workspace-refresh"
      onClick={() => router.refresh()}
    >
      Refresh server content
    </button>
  );
}
