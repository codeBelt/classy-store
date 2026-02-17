import {ApiSignature} from '../components/ApiSignature';
import {TipBox} from '../components/TipBox';
import {ShallowEqualDemo} from '../demos/shallow-equal/ShallowEqualDemo';

export function ShallowEqualPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">shallowEqual</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Prevent unnecessary re-renders when a selector returns a new object or
          array with the same values.
        </p>
      </header>

      <ApiSignature
        importPath="@codebelt/classy-store/utils"
        signature="shallowEqual<T>(a: T, b: T): boolean"
      />

      <div className="flex flex-col gap-6">
        <TipBox variant="warning">
          You do <strong>not</strong> need{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">shallowEqual</code>{' '}
          when selecting a class getter. Getters are computed values — they are
          automatically memoized and return the same reference until one of
          their dependencies actually changes. Only reach for{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">shallowEqual</code>{' '}
          when your <em>selector function</em> itself creates a new object or
          array (e.g.{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            {'(s) => ({ a: s.x, b: s.y })'}
          </code>
          ) within a component.
        </TipBox>

        <ShallowEqualDemo />
        <TipBox>
          Use{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">shallowEqual</code>{' '}
          as the third argument to{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">useStore</code>{' '}
          when your selector creates a new object or array by combining multiple
          properties. Without it, every store change triggers a re-render
          because{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            {'{}'} !== {'{}'}
          </code>
          .
        </TipBox>
      </div>
    </>
  );
}
