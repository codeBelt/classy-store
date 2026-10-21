export class ScaleStore {
  items: {id: number; text: string; completed: boolean}[];
  unrelated = 0;

  constructor(size: number) {
    this.items = Array.from({length: size}, (_, index) => ({
      id: index,
      text: `Item ${index}`,
      completed: false,
    }));
  }

  setText(index: number, text: string): void {
    this.items[index].text = text;
  }
}
