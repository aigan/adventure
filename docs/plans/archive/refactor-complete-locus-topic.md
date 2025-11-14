# Refactor Complete: Topic → Locus, subject → topic

## Summary

Successfully refactored `public/lib/gui.mjs` to resolve the naming overload between GUI terms and data model terms.

**Date**: 2025-11-14

---

## Changes Made

### Global Object Renamed

**Before**: `export const Topic`
**After**: `export const Locus`

The main GUI object is now `Locus` to avoid confusion with the data model's `Subject` class.

### Field Renamed

**Before**: `locus.subject` (confusing with data model Subject)
**After**: `locus.topic` (what's being displayed/discussed)

### Structure Changes

**Before**:
```javascript
Topic = {
  main: {topics: [], ...},
  topics: {},  // Registry of all containers
  selected: null
}

topic = {
  id, parent, slug, element,
  subject: {...}  // The data
}
```

**After**:
```javascript
Locus = {
  main: {loci: [], ...},
  loci: {},  // Registry of all loci
  selected: null
}

locus = {
  id, parent, slug, element,
  topic: {...}  // The data
}
```

### Variable Renamings

| Old | New | Context |
|-----|-----|---------|
| `Topic` | `Locus` | Global object |
| `.subject` | `.topic` | Field name |
| `topic` | `locus` | Local variables (containers) |
| `subject` | `topic_data` | Local variables (data payloads) |
| `.topics` | `.loci` | Array of locus containers in menus |

### CSS Classes

**Unchanged**: `class="topic"` in HTML
- This is for styling and doesn't need to change
- Still refers to clickable topics in the narrative

---

## Files Changed

- `public/lib/gui.mjs` - Complete refactor

---

## Verification

### No old references remain:
- ✅ 0 occurrences of `Topic.`
- ✅ 0 occurrences of `.subject`

### New structure in place:
- ✅ 54 occurrences of `Locus.`
- ✅ 7 occurrences of `.topic`

---

## Terminology Now Clear

### GUI Layer (public/lib/gui.mjs)

**Locus**:
- Container for interactive elements
- Has `id`, `parent`, `slug`, `element`
- Contains a `topic` (the data)

**locus.topic**:
- The data being displayed
- Can be a baked observation: `{id, description_short, actions, is:'entity'}`
- Can be an action: `{do, label, ...}`

### Data Model (public/worker/)

**Subject** (class):
- Persistent identity across states
- Has `sid` (subject ID)
- No confusion with GUI anymore!

**Belief** (class):
- State-specific instance of a Subject
- What gets observed and displayed

---

## Message Format (Unchanged)

The wire format between worker and GUI is unchanged:

**Baked Observation**:
```javascript
{
  id: 123,                     // Subject ID (sid)
  description_short: 'courtyard',
  actions: [...],
  is: 'entity'
}
```

This becomes `locus.topic` when displayed in GUI.

---

## What's Next

With terminology clarified, next steps:

1. ✅ **Done**: Refactor GUI naming
2. **TODO**: Change action field names (decide on `target_blipp`/`subject_blopp` → simpler names)
3. **TODO**: Add message enrichment (resolve subject IDs to Beliefs)
4. **TODO**: Implement handlers (do_look, etc.)
5. **TODO**: Consider renaming `is: 'entity'` → `is: 'observation'`

---

## Testing

**Manual test needed**:
1. Start server
2. Load game
3. Verify entities are clickable
4. Verify action menus appear
5. Verify keyboard navigation works

The refactoring is purely structural - no behavior changes intended.

---

## Benefits

**Clarity**:
- GUI "locus" ≠ data model "Subject"
- GUI "topic" ≠ data model "Subject"
- No more mental overhead tracking which "subject" you mean

**Semantics**:
- **Locus** = location/place in UI (Latin for "place")
- **Topic** = what's being shown/discussed
- Both clear, non-overlapping meanings

**Maintainability**:
- Easier for others to understand
- Easier to document
- Easier to reason about
