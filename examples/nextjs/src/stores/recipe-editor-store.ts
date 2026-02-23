export class RecipeEditorStore {
  title = '';
  description = '';
  prepMinutes = 15;
  cookMinutes = 30;
  servings = 4;
  ingredients: string[] = [''];
  instructions: string[] = [''];

  get totalTime(): number {
    return this.prepMinutes + this.cookMinutes;
  }

  get isValid(): boolean {
    return (
      this.title.trim().length > 0 &&
      this.ingredients.some((i) => i.trim().length > 0) &&
      this.instructions.some((i) => i.trim().length > 0)
    );
  }

  get ingredientSummary(): string {
    const filled = this.ingredients.filter((i) => i.trim().length > 0);
    return `${filled.length} ingredient${filled.length !== 1 ? 's' : ''}`;
  }

  get instructionCount(): number {
    return this.instructions.filter((i) => i.trim().length > 0).length;
  }

  setTitle(title: string) {
    this.title = title;
  }

  setDescription(desc: string) {
    this.description = desc;
  }

  setPrepMinutes(mins: number) {
    this.prepMinutes = mins;
  }

  setCookMinutes(mins: number) {
    this.cookMinutes = mins;
  }

  setServings(s: number) {
    this.servings = s;
  }

  addIngredient() {
    this.ingredients.push('');
  }

  removeIngredient(index: number) {
    this.ingredients.splice(index, 1);
  }

  updateIngredient(index: number, value: string) {
    this.ingredients[index] = value;
  }

  addInstruction() {
    this.instructions.push('');
  }

  removeInstruction(index: number) {
    this.instructions.splice(index, 1);
  }

  updateInstruction(index: number, value: string) {
    this.instructions[index] = value;
  }
}
