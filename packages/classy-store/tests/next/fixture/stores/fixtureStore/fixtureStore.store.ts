import type {StoreData} from '../../types/fixture.types';

export class FixtureStore {
  text: string;
  count: number;

  constructor(initialData: StoreData) {
    this.text = initialData.text;
    this.count = initialData.count;
  }
}
