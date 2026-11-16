// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Mermaid sanitizes generated SVG at securityLevel strict, and React must insert the SVG markup to render it.
'use client';

import {useTheme} from 'next-themes';
import {useEffect, useId, useState} from 'react';

export function Mermaid({chart}: {chart: string}) {
  const id = useId().replaceAll(':', '');
  const {resolvedTheme} = useTheme();
  const [svg, setSvg] = useState<string>();

  useEffect(() => {
    let active = true;

    void import('mermaid').then(async ({default: mermaid}) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        fontFamily: 'inherit',
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      });

      const rendered = await mermaid.render(`classy-store-${id}`, chart);
      if (active) setSvg(rendered.svg);
    });

    return () => {
      active = false;
    };
  }, [chart, id, resolvedTheme]);

  if (!svg) {
    return (
      <pre className="my-6 overflow-x-auto rounded-xl border bg-fd-card p-4 text-sm">
        {chart}
      </pre>
    );
  }

  return (
    <div
      className="my-6 overflow-x-auto"
      dangerouslySetInnerHTML={{__html: svg}}
    />
  );
}
