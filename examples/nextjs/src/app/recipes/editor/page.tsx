import {RecipeEditor} from '@/components/editor/RecipeEditor';

export default function EditorPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Recipe Editor</h1>
        <p className="text-muted mt-1">
          Component-scoped store with useLocalStore and undo/redo via
          withHistory.
        </p>
      </div>
      <RecipeEditor />
    </div>
  );
}
