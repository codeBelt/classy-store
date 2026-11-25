# Brief: `persist`, `devtools` and `history`

- **Report:** `review/stage-3/persist-devtools.md`
- **Scratch folder:** `<scratch>/stage-3-persist-devtools/`
- **Skill to load first:** `mattpocock-skills:prototype`, then
  `security-and-hardening`
- **Spikes:** yes, as the common brief describes.

## Subject

`packages/classy-store/src/utils/persist/`, `utils/devtools/`,
`utils/history/`, `utils/cloneSnapshot/` and `utils/utilityStatus/`. Stage 1
findings 52 to 57. Read `review/stage-2/security.md`,
`review/stage-2/legend-state.md` and `review/stage-2/zustand-jotai.md`, and
the "Persist, devtools and the release workflow" and "From the two API reads"
lists in `review/stage-2-report.md`.

## The spikes

**P1. When hydration happens.** `persist()` reads through an `await` even
when the storage is synchronous, so a store on `localStorage` renders its
defaults first (Legend-State finding 4). Spike a synchronous path for a
synchronous storage. Decide it together with `skipHydration`, with server
rendering, and with Zustand and Jotai finding 1 (a server snapshot captured
without `prepareStoreForHydration`), which another agent spikes on the React
side: say what `persist` needs from it.

**P2. Nothing is skipped in silence.** A record `persist` cannot read, a
version that differs with no `migrate`, a version that is not a number, an
`async` `migrate`, a record with no usable `expiresAt` (security findings 4
to 6, Zustand and Jotai finding 3). Decide what each should do and through
which channel it is reported.

**P3. Options are validated when `persist()` is called.** Prototype keys,
getters and methods in `properties`, malformed transforms (security finding
1, stage 1 findings 52 and 55).

**P4. Restore is all or nothing.** A deeply nested record that restores and
then makes every snapshot and save throw (security finding 3), and a nested
`__proto__` key that survives a restore (security finding 2).

**P5. A migrated record is written back** (Zustand and Jotai finding 4), and
**a debounced save is flushed when the page is hidden** (Legend-State finding
5).

**P6. Cross-tab events** from another storage area and synthetic events
(security finding 8).

**P7. `devtools`.** Time travel that replaces state as `history` does, in one
transaction, without calling setters; action names taken from the method that
wrote; `RESET`, `COMMIT`, `ROLLBACK` and `IMPORT_STATE`; values such as
`Date` after a jump (security finding 7, Zustand and Jotai findings 6 and 7).

**P8. `history`.** An edit made in the same tick as `undo()` or `redo()` is
lost (stage 1 finding 57).

**P9. Option names and defaults** against Zustand and Jotai: `storage`
defaulting to `localStorage`, `expireIn` with `clearOnExpire`, and the rest of
the table in `review/stage-2/legend-state.md` ("Our options next to
Legend's") and `review/stage-2/zustand-jotai.md` ("Names a user from either
library would trip on"). No spike: a recommendation per option.

Then the combination you would recommend, with full measures and the size of
the `./utils` entry.
