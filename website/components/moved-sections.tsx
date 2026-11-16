'use client';

import Link from 'next/link';
import {type ReactNode, useEffect} from 'react';

type Section = {hash: string; path: string; title: ReactNode};

// The npm README and existing bookmarks link to headings on the former /docs/ page.
export function MovedSections({sections}: {sections: Section[]}) {
  useEffect(() => {
    function followSection() {
      const link = document.getElementById(window.location.hash.slice(1));
      if (
        link instanceof HTMLAnchorElement &&
        link.hasAttribute('data-moved-section')
      ) {
        window.location.replace(link.href);
      }
    }

    followSection();
    window.addEventListener('hashchange', followSection);
    return () => window.removeEventListener('hashchange', followSection);
  }, []);

  return (
    <details>
      <summary>Section index</summary>
      <ul>
        {sections.map(({hash, path, title}) => (
          <li key={path + hash}>
            <Link
              id={hash.slice(1)}
              data-moved-section={true}
              href={path + hash}
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
