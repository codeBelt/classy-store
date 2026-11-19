/** Bytes of one entry point, bundled with the main entry and minified. */
export type EntrySize = {
  minified: number;
  gzip: number;
  /** Gzipped bytes on top of the main entry alone. Zero for the main entry. */
  added: number;
};

/** Sizes by export name, for example `.` and `./react`. */
export type Sizes = Record<string, EntrySize>;

/** `baseline.json`: the sizes later changes are compared with. */
export type SizeBaseline = {
  bun: string;
  entries: Sizes;
};
