'use client';

import { useEffect, useId, useState } from 'react';

interface MermaidProps {
  chart: string;
}

/**
 * Client-side Mermaid renderer. Diagrams re-render when the color scheme
 * changes by observing the `dark` class on the document element.
 */
export function Mermaid({ chart }: MermaidProps) {
  const id = useId();
  const [svg, setSvg] = useState('');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains('dark'));
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const render = async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        fontFamily: 'inherit',
      });

      const renderId = `mmd-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
      try {
        const result = await mermaid.render(renderId, chart);
        if (active) {
          setSvg(result.svg);
        }
      } catch {
        // Invalid diagram source should not crash the page.
      }
    };

    void render();
    return () => {
      active = false;
    };
  }, [chart, dark, id]);

  return (
    <div
      className="my-4 flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid renders trusted, authored diagrams in strict mode
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
