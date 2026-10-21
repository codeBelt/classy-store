export type Selection = {name: string};

export type ConsumerProps = {
  onCommit: (value: string) => void;
  isEqual?: (previous: Selection, next: Selection) => boolean;
  prefix?: string;
};
