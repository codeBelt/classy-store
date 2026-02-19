'use client';

import {useStore} from '@codebelt/classy-store/react';
import {useState} from 'react';
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
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">
        Tag Manager ({snap.allTags._items.length} tags)
      </h2>
      <div className="flex flex-wrap gap-1">
        {(snap.allTags._items as readonly string[]).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs bg-accent-light text-accent px-2 py-0.5 rounded-full"
          >
            {tag}
            <span className="text-muted">({snap.tagCounts[tag] || 0})</span>
            <button
              type="button"
              onClick={() => recipeStore.removeTag(tag)}
              className="hover:text-danger ml-0.5"
              aria-label={`Remove tag ${tag}`}
            >
              x
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1"
          placeholder="New tag..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
        >
          Add Tag
        </button>
      </div>
    </div>
  );
}
