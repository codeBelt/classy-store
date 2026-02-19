import {AddRecipeForm} from '@/components/recipes/AddRecipeForm';
import {RecipeFilter} from '@/components/recipes/RecipeFilter';
import {RecipeList} from '@/components/recipes/RecipeList';
import {TagManager} from '@/components/recipes/TagManager';

export default function RecipesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="text-muted text-sm mt-1">
          Browse, filter, and manage your recipe collection using ReactiveMap
          and ReactiveSet.
        </p>
      </div>
      <RecipeFilter />
      <TagManager />
      <RecipeList />
      <AddRecipeForm />
    </div>
  );
}
