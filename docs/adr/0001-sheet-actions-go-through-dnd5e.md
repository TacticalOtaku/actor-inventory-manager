# Sheet actions go through dnd5e, never our own rolls

The module's sheet runs in a GM's world with a large set of modules (roll automation, dice, effects) that we cannot
reproduce or test against; live checks happen only in our own world. So every roll, item use, rest, HP change and
spell slot spend the sheet triggers calls the dnd5e document API (`actor.rollSkill`, `item.use`, `actor.shortRest`,
`actor.applyDamage` and their kin) and lets dnd5e fire its own hooks, instead of computing or posting results
ourselves; rare configuration (advancement, special traits, roll settings) opens dnd5e's own dialogs.

## Consequences

- A feature dnd5e has no API for is a reason to rethink the feature, not to reimplement dnd5e.
- Visual effects react to the resulting document updates, not to our own predicted outcome.
