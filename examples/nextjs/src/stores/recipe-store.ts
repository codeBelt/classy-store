import {createClassyStore} from '@codebelt/classy-store';
import {reactiveMap, reactiveSet} from '@codebelt/classy-store/collections';
import {devtools} from '@codebelt/classy-store/utils';

export type Recipe = {
  id: string;
  title: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: string[];
  instructions: string[];
  tags: string[];
};

class RecipeStore {
  recipes = reactiveMap<string, Recipe>([
    [
      'pasta-carbonara',
      {
        id: 'pasta-carbonara',
        title: 'Pasta Carbonara',
        description: 'Classic Italian pasta with eggs, cheese, and pancetta.',
        prepMinutes: 10,
        cookMinutes: 20,
        servings: 4,
        ingredients: [
          '400g spaghetti',
          '200g pancetta',
          '4 egg yolks',
          '100g pecorino romano',
          'Black pepper',
        ],
        instructions: [
          'Cook spaghetti in salted boiling water.',
          'Fry pancetta until crispy.',
          'Mix egg yolks with grated pecorino.',
          'Toss hot pasta with pancetta, then egg mixture off heat.',
          'Season with black pepper and serve.',
        ],
        tags: ['italian', 'pasta', 'quick'],
      },
    ],
    [
      'chicken-stir-fry',
      {
        id: 'chicken-stir-fry',
        title: 'Chicken Stir Fry',
        description: 'Quick and healthy chicken with vegetables.',
        prepMinutes: 15,
        cookMinutes: 10,
        servings: 2,
        ingredients: [
          '300g chicken breast',
          '1 bell pepper',
          '1 broccoli head',
          '3 tbsp soy sauce',
          '1 tbsp sesame oil',
          '2 cloves garlic',
        ],
        instructions: [
          'Slice chicken into strips.',
          'Cut vegetables into bite-size pieces.',
          'Heat sesame oil in a wok over high heat.',
          'Stir-fry chicken until golden, then add vegetables.',
          'Add soy sauce and garlic, cook 2 more minutes.',
        ],
        tags: ['asian', 'healthy', 'quick'],
      },
    ],
    [
      'banana-bread',
      {
        id: 'banana-bread',
        title: 'Banana Bread',
        description: 'Moist and delicious banana bread, perfect for breakfast.',
        prepMinutes: 15,
        cookMinutes: 60,
        servings: 8,
        ingredients: [
          '3 ripe bananas',
          '75g melted butter',
          '150g sugar',
          '1 egg',
          '1 tsp vanilla',
          '190g flour',
          '1 tsp baking soda',
        ],
        instructions: [
          'Preheat oven to 175C.',
          'Mash bananas and mix with melted butter.',
          'Stir in sugar, beaten egg, and vanilla.',
          'Add flour and baking soda, mix until just combined.',
          'Pour into a greased loaf pan and bake for 60 minutes.',
        ],
        tags: ['baking', 'breakfast', 'vegetarian'],
      },
    ],
    [
      'greek-salad',
      {
        id: 'greek-salad',
        title: 'Greek Salad',
        description: 'Fresh Mediterranean salad with feta and olives.',
        prepMinutes: 10,
        cookMinutes: 0,
        servings: 4,
        ingredients: [
          '4 tomatoes',
          '1 cucumber',
          '1 red onion',
          '200g feta cheese',
          '100g kalamata olives',
          'Olive oil',
          'Oregano',
        ],
        instructions: [
          'Chop tomatoes, cucumber, and onion into chunks.',
          'Combine vegetables in a large bowl.',
          'Add olives and crumbled feta on top.',
          'Drizzle with olive oil and sprinkle oregano.',
        ],
        tags: ['mediterranean', 'healthy', 'vegetarian', 'no-cook'],
      },
    ],
    [
      'beef-tacos',
      {
        id: 'beef-tacos',
        title: 'Beef Tacos',
        description: 'Seasoned ground beef tacos with fresh toppings.',
        prepMinutes: 10,
        cookMinutes: 15,
        servings: 4,
        ingredients: [
          '500g ground beef',
          '1 packet taco seasoning',
          '8 taco shells',
          'Shredded lettuce',
          'Diced tomatoes',
          'Shredded cheese',
          'Sour cream',
        ],
        instructions: [
          'Brown ground beef in a skillet, drain fat.',
          'Add taco seasoning and water, simmer 5 minutes.',
          'Warm taco shells in the oven.',
          'Fill shells with beef and top with lettuce, tomatoes, cheese, and sour cream.',
        ],
        tags: ['mexican', 'quick'],
      },
    ],
  ]);

  allTags = reactiveSet<string>([
    'italian',
    'pasta',
    'quick',
    'asian',
    'healthy',
    'baking',
    'breakfast',
    'vegetarian',
    'mediterranean',
    'no-cook',
    'mexican',
  ]);

  filter = {
    searchTerm: '',
    selectedTags: [] as string[],
    maxPrepTime: 0,
  };

  get filteredRecipes(): Recipe[] {
    const all = Array.from(this.recipes.values());
    return all.filter((recipe) => {
      if (
        this.filter.searchTerm &&
        !recipe.title
          .toLowerCase()
          .includes(this.filter.searchTerm.toLowerCase()) &&
        !recipe.description
          .toLowerCase()
          .includes(this.filter.searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (
        this.filter.selectedTags.length > 0 &&
        !this.filter.selectedTags.some((tag) => recipe.tags.includes(tag))
      ) {
        return false;
      }
      if (
        this.filter.maxPrepTime > 0 &&
        recipe.prepMinutes > this.filter.maxPrepTime
      ) {
        return false;
      }
      return true;
    });
  }

  get recipeCount(): number {
    return this.recipes.size;
  }

  get averageTotalTime(): number {
    const all = Array.from(this.recipes.values());
    if (all.length === 0) return 0;
    const total = all.reduce(
      (sum, r) => sum + r.prepMinutes + r.cookMinutes,
      0,
    );
    return Math.round(total / all.length);
  }

  get tagCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const recipe of this.recipes.values()) {
      for (const tag of recipe.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }

  addRecipe(recipe: Recipe) {
    this.recipes.set(recipe.id, recipe);
    for (const tag of recipe.tags) {
      this.allTags.add(tag);
    }
  }

  removeRecipe(id: string) {
    this.recipes.delete(id);
  }

  setSearchTerm(term: string) {
    this.filter.searchTerm = term;
  }

  toggleTagFilter(tag: string) {
    const index = this.filter.selectedTags.indexOf(tag);
    if (index === -1) {
      this.filter.selectedTags.push(tag);
    } else {
      this.filter.selectedTags.splice(index, 1);
    }
  }

  addTag(tag: string) {
    this.allTags.add(tag);
  }

  removeTag(tag: string) {
    this.allTags.delete(tag);
  }
}

export const recipeStore = createClassyStore(new RecipeStore());

devtools(recipeStore, {name: 'Recipe Store'});
