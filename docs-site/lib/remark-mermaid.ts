import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import { visit } from 'unist-util-visit';

/**
 * Converts ```mermaid fenced code blocks into <Mermaid chart="..." /> elements
 * so they render as diagrams instead of syntax-highlighted code.
 */
export function remarkMermaid() {
  return (tree: Root): void => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (
        node.lang !== 'mermaid' ||
        parent === undefined ||
        index === undefined
      ) {
        return;
      }

      const element: MdxJsxFlowElement = {
        type: 'mdxJsxFlowElement',
        name: 'Mermaid',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'chart', value: node.value },
        ],
        children: [],
      };

      parent.children[index] = element;
    });
  };
}
