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

/**
 * One entry of `budgets.json`, in gzipped bytes. The budget is what the entry
 * may measure today; the ceiling is the most its budget may ever be, and it
 * changes only in a commit of its own (record 0004).
 */
export type Budget = {
  budget: number;
  ceiling: number;
};

/** `budgets.json`: a budget and a ceiling per export name. */
export type Budgets = Record<string, Budget>;
