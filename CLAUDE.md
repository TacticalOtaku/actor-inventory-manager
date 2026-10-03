# Actor Inventory Manager — project rules

Inventory window with a paperdoll, equipment rules and player trading for dnd5e 5.3.3 on Foundry VTT 14.367. The code
map, the public API and the dnd5e data-shape rules are in `docs/architecture.md`.

## Commands

- `npm run check` — ESLint + `node --test`. Must be green before claiming anything.
- `npm run deploy` — copies the module to `%LOCALAPPDATA%/FoundryVTT/Data/modules/actor-inventory-manager`
  (or `FOUNDRY_DATA` / `--data <path>`, the Foundry `Data` folder).
- `npm run release` — check + `tools/package.mjs`: validates module.json against package.json and writes
  `dist/actor-inventory-manager-v<version>.zip`; it refuses to replace an existing archive.

## Foundry API truth

Never guess v14 or dnd5e APIs. Read the installed sources: `D:\Foundry\Foundry Virtual Tabletop\resources\app`
(`client/`, `common/`) and `%LOCALAPPDATA%/FoundryVTT/Data/systems/dnd5e`.

## Architecture invariants

- `scripts/core/` stays importable in plain Node. If it needs the runtime, add a port (see
  `core/paperdoll-runtime.js` and `foundry/paperdoll-runtime.js`).
- Every read of a dnd5e field that has moved between versions goes through its named helper (table in
  `docs/architecture.md`); never inline it at a call site. New helpers arrive with a test pinning the 5.3.3 shape.
- Weighty Containers is reached only through `integrations/weighty-containers.js`: delegate, never reimplement its
  load or restriction logic; feature-detect and fall back when it is absent or outdated.
- Trading: the socket never authorises a write. Requests are user flags; one active GM coordinates and rechecks
  ownership and confirmations; inventory snapshots live only in a private JournalEntry.
- Windows are keyed by actor UUID. Observer gets a read-only window; Owner or GM may change things.
- Theme tokens live on `.tc-root`, the root of each module window (it also carries `.actor-inventory-manager-app`),
  never on `:root`; the injected sheet header button carries no tokens. Do not
  transition `background` or `all` on elements whose background comes from a token; expose rarity and spell-school
  colours as custom properties, not inline `color:`.
- Decorative web fonts load only while the client setting allows it.
- Adding a stylesheet or language to `module.json` needs a Foundry server restart, not F5.

## Live verification (world `test`, dnd5e 5.3.3)

- The manual trading checklist is in `README.md`.
- The user may be playing in world `test`: never shut down or relaunch it without asking.
