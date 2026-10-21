import {createClassyStore} from '@codebelt/classy-store';

export class ScaleStore {
  ignored = 0;
  fields: {value: string}[];
  rows: {title: string; count: number}[];

  constructor(size: number) {
    this.fields = Array.from({length: size}, (_, index) => ({
      value: `Field ${index}`,
    }));
    this.rows = Array.from({length: size}, (_, index) => ({
      title: `Row ${index}`,
      count: index,
    }));
  }

  setFieldValue(index: number, value: string) {
    this.fields[index].value = value;
  }
}

export function createScaleStore(size: number) {
  return createClassyStore(new ScaleStore(size));
}
