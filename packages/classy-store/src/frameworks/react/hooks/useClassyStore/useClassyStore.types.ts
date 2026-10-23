export type EqualityFn<T> = (a: T, b: T) => boolean;

export type UseClassyStoreSelectorOptions<S> = {
  isEqual?: EqualityFn<S>;
};
