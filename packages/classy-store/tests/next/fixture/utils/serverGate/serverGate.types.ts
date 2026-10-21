export type ServerGate = {
  pending: Promise<void>;
  release: () => void;
  timer: ReturnType<typeof setTimeout>;
};
