// Shared by the server-safe preparation entry and the client hooks in each
// module graph. A late Suspense boundary may need initial data after an earlier
// consumer has hydrated and changed the live store.
export const hydrationSnapshots = new WeakMap<object, object>();
