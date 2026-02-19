'use client';

import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';

export function TagManager() {
  const snap = useStore(recipeStore);
  const [newTag, setNewTag] = useState('');

  const handleAdd = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag) {
      recipeStore.addTag(tag);
      setNewTag('');
    }
  };

  return (
    <div className="glass-card p-6 space-y-4 animate-slide-up-delay-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg tracking-tight">
          Tag Manager{' '}
          <span className="text-muted-foreground text-sm font-normal">
            ({snap.allTags._items.length} tags)
          </span>
        </h2>
        <ApiInfo
          alignment="left"
          apis={['useStore (auto-tracked)', 'reactiveSet']}
          description="Demonstrates ReactiveSet's add/delete/iteration through tag management."
          code={`recipeStore.addTag(tag);    // ReactiveSet.add()
recipeStore.removeTag(tag); // ReactiveSet.delete()`}
        />
      </div>

      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {(snap.allTags._items as readonly string[]).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full group hover:bg-primary/20 transition-colors"
          >
            <span className="font-medium">{tag}</span>
            <span className="text-primary/60">
              ({snap.tagCounts[tag] || 0})
            </span>
            <button
              type="button"
              onClick={() => recipeStore.removeTag(tag)}
              className="text-primary/40 hover:text-white transition-colors ml-0.5 rounded-full p-0.5 hover:bg-white/10"
              aria-label={`Remove tag ${tag}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
        {snap.allTags._items.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No tags yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70"
            placeholder="Add new tag..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newTag.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
        >
          Add Tag
        </button>
      </div>
    </div>
  );
}
