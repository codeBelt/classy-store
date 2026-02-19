import {AddRecipeForm} from '@/components/recipes/AddRecipeForm';
import {RecipeFilter} from '@/components/recipes/RecipeFilter';
import {RecipeList} from '@/components/recipes/RecipeList';
import {TagManager} from '@/components/recipes/TagManager';

export default function RecipesPage() {
  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Hero Section */}
      <section className="relative">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Recipes
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Browse your collection, filter by tags, and manage your culinary
            creations.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-8">
          <RecipeList />
        </div>

        <div className="lg:col-span-4 space-y-6 sticky top-24">
          <RecipeFilter />
          <TagManager />
        </div>
      </section>

      {/* Add New Section */}
      <section className="border-t border-white/5 pt-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Create New Recipe
            </h2>
            <p className="text-muted-foreground mt-2">
              Add a new dish to your collection using the form below.
            </p>
          </div>
          <AddRecipeForm />
        </div>
      </section>
    </div>
  );
}
