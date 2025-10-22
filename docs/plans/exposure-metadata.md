# Exposure Metadata for Observation System

**Goal**: Add exposure metadata to archetypes and traittypes to support observation mechanics - what can be seen, touched, or otherwise perceived about entities.

**Related**:
- docs/notes/observations.md - Design notes on trait exposure system
- docs/ALPHA-1.md Stage 1 - LOOK command implementation (needs exposure data)

## Context

The observation system needs to know what traits are observable through different sensory modalities:
- `color` requires seeing the surface (`exposure: 'surface_visual'`)
- `weight` requires touching/holding (`exposure: 'tactile_mass'`)
- `location` requires spatial awareness (`exposure: 'spatial_presence'`)
- `mind` is not physically observable (`exposure: 'internal_state'`)

This metadata enables:
- LOOK command filtering to visible traits
- Realistic perception (can't see weight, can't feel color from distance)
- Detective gameplay (what clues are observable?)
- Stealth mechanics (spatial prominence affects observability)

## Design Principles

**Optimize for the common case:**
- Most entities inherit exposure rules from archetypes automatically
- Zero overhead for typical objects
- Define once at archetype/traittype level, inherit everywhere

**Support edge cases:**
- Override exposure on specific archetypes (invisible ghost, hidden compartment)
- Override at trait level for special instances (colorless poison)
- Extensible for future needs (obscurement, detection difficulty)

## Implementation Steps

### 1. Add `exposure` to Traittype class

**File**: `public/worker/traittype.mjs`

Add property to constructor:
```javascript
constructor(label, def) {
  this.label = label

  if (typeof def === 'string') {
    this.data_type = def
    this.exposure = null  // No exposure specified
    this.container = null
    ...
  } else {
    this.data_type = def.type
    this.exposure = def.exposure ?? null  // NEW
    this.container = def.container ?? null
    this.mind_scope = def.mind ?? null
    ...
  }
}
```

### 2. Add `meta` to Archetype class

**File**: `public/worker/archetype.mjs`

Add metadata storage to constructor:
```javascript
constructor(label, {bases=[], traits={}, meta={}}) {
  this.label = label
  this.meta = meta  // NEW: Store archetype metadata (exposure, etc.)

  this.bases = new Set()
  for (const base_label of bases) {
    const base = DB.archetype_by_label[base_label]
    assert(base != null, ...)
    this.bases.add(base)
  }

  this.traits_template = traits
}
```

### 3. Update type definitions

**File**: `public/worker/db.mjs`

Update JSDoc:
```javascript
/**
 * @typedef {object} ArchetypeDefinition
 * @property {string[]} [bases] - Base archetype labels
 * @property {Object<string, *>} [traits] - Default trait values
 * @property {object} [meta] - Archetype metadata (exposure, spatial_prominence, etc.)
 */

/**
 * @typedef {object} TraitTypeSchema
 * @property {string} type - Base type
 * @property {Function} [container] - Container constructor
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 * @property {string} [mind] - Mind scope for Subject resolution
 * @property {string} [exposure] - Observation modality required to perceive this trait
 */
```

### 4. Add example exposure definitions

**File**: `public/worker/world.mjs`

```javascript
const traittypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent',
    exposure: 'internal_correspondence'  // Not directly observable
  },
  location: {
    type: 'Location',
    exposure: 'spatial_presence'  // Observable through spatial awareness
  },
  color: {
    type: 'string',
    exposure: 'surface_visual'  // Observable by looking at surface
  },
  mind_states: {
    type: 'State',
    container: Array,
    min: 1,
    exposure: 'internal_state'  // Not physically observable
  },
};

const archetypes = {
  ObjectPhysical: {
    meta: {
      exposure: 'physical_form'  // Has physical presence
    },
    traits: {
      '@about': null,
      location: null,
      color: null,
    },
  },
  Mental: {
    meta: {
      exposure: 'cognitive_state'  // Not physically observable
    },
    traits: {
      mind_states: null,
    },
  },
  // PortableObject, Location, etc. inherit from ObjectPhysical
  // → automatically get exposure: 'physical_form'
};
```

### 5. Add TODO comment to recognize()

**File**: `public/worker/state.mjs`

Document future integration with acquaintance trait:
```javascript
recognize(belief) {
  // Query DB for all beliefs in this mind about the same subject
  const beliefs_about_subject = DB.find_beliefs_about_subject(
    this.in_mind,
    belief.subject,
    this
  )

  // TODO: Sort by confidence (for now just return first 3)
  // TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
  // TODO: Filter by acquaintance threshold - beliefs with low acquaintance
  //       may not trigger recognition during perception events
  return beliefs_about_subject.slice(0, 3)
}
```

### 6. Add tests

**Files**: `test/traittype.test.mjs`, `test/archetype.test.mjs`

Test exposure storage:
- Traittype stores exposure from schema
- Traittype defaults to null when no exposure
- Archetype stores meta.exposure
- Archetype defaults to empty object when no meta

## Exposure Vocabulary (Examples)

**Visual modalities:**
- `surface_visual` - color, surface appearance
- `form_visual` - shape, size (from distance)

**Tactile modalities:**
- `surface_tactile` - texture, temperature
- `tactile_mass` - weight, density (requires holding)

**Spatial:**
- `spatial_presence` - location, proximity
- `spatial_prominence` - how noticeable (prominent/exposed/obscured/hidden)

**Internal/Cognitive:**
- `internal_state` - thoughts, feelings, memories
- `internal_correspondence` - identity references (@about)

**Special:**
- `chemical_analysis` - poison detection, material composition
- `deep_investigation` - requires detailed examination
- `concealed_physical` - hidden compartments, secret doors

Vocabulary can evolve as game needs emerge.

## How Inheritance Works

```javascript
// Define once on archetype
ObjectPhysical: {
  meta: {exposure: 'physical_form'},
  traits: {color: null, location: null}
}

// All descendants inherit automatically
PortableObject extends ObjectPhysical  // ✓ physical_form
Location extends ObjectPhysical        // ✓ physical_form
Actor extends ObjectPhysical           // ✓ physical_form

// Thousands of entities inherit for free
hammer: {bases: ['PortableObject']}    // ✓ physical_form
workshop: {bases: ['Location']}        // ✓ physical_form

// Override only when needed
ghost: {
  bases: ['Actor'],
  meta: {exposure: 'spectral_presence'}  // Override
}
```

## Future Integration

Once exposure metadata exists:

**LOOK command** (Alpha 1 Stage 1):
```javascript
// Get all visible traits from entities in current location
const visible_traits = entity.get_traits_with_exposure('surface_visual')
```

**Perception events**:
```javascript
// Create observation with only accessible traits
const observation = observe(entity, {
  modalities: ['surface_visual', 'spatial_presence']
})
```

**learn_about() integration**:
```javascript
// Filter trait_names by what the observation modality exposes
const observable_traits = trait_names.filter(t =>
  traittype[t].exposure in observation.modalities
)
state.learn_about(source_state, belief, observable_traits)
```

**Acquaintance/Recognition**:
```javascript
// recognize() uses acquaintance threshold to determine recognition
const candidates = recognize(perceived_entity)
  .filter(b => b.traits.get('acquaintance') > threshold)
```

## Current Status

- [ ] Add exposure to Traittype
- [ ] Add meta to Archetype
- [ ] Update type definitions
- [ ] Add example definitions to world.mjs
- [ ] Add TODO to recognize()
- [ ] Add tests
- [ ] Run test suite

## Notes

**Why now?**
- Just completed `learn_about()` → `recognize()` → `integrate()` refactor
- Observation system needs this metadata to function
- Foundation for LOOK command (Alpha 1 Stage 1)

**Design trade-off:**
- Could make exposure required, but keeping it optional allows gradual adoption
- Empty/null exposure means "no restrictions" for now, refine later

**Acquaintance trait:**
- Future trait on knowledge beliefs: `acquaintance: 0.8`
- Determines recognition probability during perception
- High acquaintance → immediate recognition
- Low acquaintance → might not recognize or create duplicate belief
