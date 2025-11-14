# Message Formats: Client ↔ Worker

## Overview

This document defines the message formats used between the client (GUI) and worker threads. It compares the old system (in `lab/ancient-worker/`) with the current implementation to identify what needs to be finalized.

---

## Current State

### Observation Object (Worker-side, Pre-baking)

**Location**: `public/worker/session.mjs:103-114`

```javascript
const obs = {
  subject: loc,                    // Subject instance
  known_as: narrator.desig(st, loc),  // string: display name
  actions: [
    {
      do: 'look',                  // string: command name
      target_blipp: loc.sid,       // number: subject ID
      subject_blopp: pl.sid,       // number: subject ID (actor)
      label: `Look around`,        // string: display text
    },
  ],
}
```

**Fields**:
- `subject`: Subject instance (worker-side object)
- `known_as`: Display name/designation (string)
- `actions`: Array of action objects (see below)

### Action Object Format

**Current** (in `session.mjs`):
```javascript
{
  do: 'look',            // Command name to execute
  target_blipp: 123,     // Subject ID of target
  subject_blopp: 456,    // Subject ID of actor
  label: 'Look around'   // Display text for GUI
}
```

**Old system** (in `lab/ancient-worker/observation.mjs:125-130`):
```javascript
{
  do: 'ask-about',       // Command name
  target: 138,           // Entity ID of target
  subject: 138,          // Entity ID of subject (optional)
  label: 'ask about herself'
}
```

**Differences**:
| Field | Old System | New System | Question |
|-------|------------|------------|----------|
| Target ID | `target` | `target_blipp` | Keep or standardize? |
| Actor ID | `subject` | `subject_blopp` | Keep or standardize? |
| ID type | Entity ID | Subject ID (sid) | ✓ This is correct |
| Command | `do` | `do` | ✓ Consistent |
| Display | `label` | `label` | ✓ Consistent |

### Baked Observation (Sent to GUI) - SubjectData

**Location**: `public/worker/narrator.mjs:87-94`

```javascript
/**
 * @typedef {Object} SubjectData
 * @property {number} id - Subject ID (sid)
 * @property {string|null} description_short - Display name
 * @property {Object[]} actions - Available actions for this subject
 * @property {'subject'} is - Type discriminator
 */
export function bake_narration( obs ){
  return {
    id: obs.subject.sid,           // Subject ID
    description_short: obs.known_as,  // Display name
    actions: obs.actions,          // Action array (unchanged)
    is: 'subject'                  // Type marker
  }
}
```

**Old system** (`lab/ancient-worker/observation.mjs:22-29`):
```javascript
export function bake_obs( obs ){
  const obj = { id: obs.entity.id };
  obj.description_short = obs.knownAs || description( obs );
  obj.actions = obs.actions;
  obj.is = 'entity';
  return obj;
}
```

**Comparison**:
| Field | Old System | New System | Notes |
|-------|------------|------------|-------|
| Function name | `bake_obs()` | `bake_narration()` | Renamed to clarify purpose |
| `id` | `obs.entity.id` (Entity ID) | `obs.subject.sid` (Subject ID) | ✓ Adapted correctly |
| `description_short` | `obs.knownAs \|\| description(obs)` | `obs.known_as` | Field name changed: `knownAs` → `known_as` |
| `actions` | `obs.actions` | `obs.actions` | ✓ Same |
| `is` | `'entity'` | `'subject'` | Updated to match terminology |

---

## Message Sending: Worker → Client

### main_add Message

**Current usage** (`session.mjs:117-118`):
```javascript
const lines = []
lines.push(narrator.tt`You are in ${obs}.`)
postMessage(['main_add', ...lines])
```

**Format**:
```javascript
['main_add', ...parts]
```

Where `parts` is an array containing:
- **Strings**: Plain text
- **Template tag results**: Objects with `{strings: TemplateStringsArray, values: BakedObservation[]}`

**Example**:
```javascript
['main_add', {
  strings: ['You are in ', '.'],
  values: [{
    id: 123,
    description_short: 'courtyard',
    actions: [{do: 'look', target_blipp: 123, subject_blopp: 456, label: 'Look around'}],
    is: 'subject'
  }]
}]
```

**Old system** (`ancient-worker/world.mjs:278`):
```javascript
postMessage(['main_add', ...lines ]);
```

Same format! ✓

### Other Worker → Client Messages

**header_set**:
```javascript
['header_set', html_string]
```

**main_clear**:
```javascript
['main_clear']
```

**topic_update**:
```javascript
['topic_update', baked_observation]
```
Updates an existing subject's data in the GUI (e.g., when actions change).

**ack** - Acknowledge command completion:
```javascript
['ack', ackid, result]
```
- `ackid`: number - The ackid from the original command
- `result`: any - Return value from the handler (can be null, or any value)

**Location**: `public/worker/worker.mjs:47-49`
```javascript
if( ackid ){
  postMessage(['ack', ackid, res ]);
}
```

**GUI handler**: `public/lib/message.mjs:15-21`
```javascript
ack([ ackid, res ]){
  if( !jobs[ackid] ) throw `No job ${ackid} found`;
  jobs[ackid].resolve( res );
  delete jobs[ackid];
}
```

The ack message resolves the promise returned by `Message.send()` with the handler's return value.

**Examples:**
- `ping` returns `'pong'` → `['ack', ackid, 'pong']`
- Action returns `null` → `['ack', ackid, null]`
- Handler returns object → `['ack', ackid, {data}]`

---

## Message Receiving: Client → Worker

### Command Message Format

**Current** (`public/lib/message.mjs:62`):
```javascript
worker.postMessage([cmd, data, ackid])
```

**Example from GUI** (when user clicks action):
```javascript
Message.send('look', {
  do: 'look',
  target_blipp: 123,
  subject_blopp: 456,
  label: 'Look around'
})

// Becomes: ['look', {do:'look', target_blipp:123, subject_blopp:456, label:'Look around'}, 1]
```

**Old system**: Same format

### start - Initialize session

**Format**:
```javascript
'start'  // String format
// OR
['start', {}, ackid]  // Array format
```

**Worker handler**: `public/worker/worker.mjs:13-18`
```javascript
async start(){
  log('Starting');
  postMessage(['main_clear'])
  const session = new Session();
  await session.start()
}
```

The worker checks for 'start' explicitly before normal dispatch:
```javascript
if( cmd === "start" ) return await dispatch.start();
```

**Note**: start can be sent as either a string `'start'` or array `['start', {}, ackid]`.

### ping - Check worker alive

**Format**:
```javascript
['ping', {}, ackid]
```

**Worker handler**: `public/worker/worker.mjs:10-12`
```javascript
ping(){
  return 'pong';
}
```

Returns `'pong'` which is sent back via ack: `['ack', ackid, 'pong']`

**Usage example:**
```javascript
const result = await Message.send('ping', {});
console.log(result); // 'pong'
```

✅ **Consistent with ack mechanism**: No separate pong message needed - uses standard ack response.

---

## Questions to Resolve

### 1. ~~Message Format Consistency~~ ✅ FIXED

**Previous issue**: `pong` used string format while all other messages used array format.

**Resolution**: Changed `pong` to use array format `['pong']` for consistency.

**Worker message handler** (`worker.mjs:30-33`):
```javascript
addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];  // Kept for backwards compatibility
  const [cmd, data={}, ackid] = msg;
```

**Note**: String→array conversion is kept for backwards compatibility but all current code uses array format.

### 2. Action Field Names (DEFERRED - DO LAST)

**Current**:
- `target_blipp` (subject ID of target)
- `subject_blopp` (subject ID of actor)

**Old system**:
- `target` (entity ID of target)
- `subject` (entity ID of subject/actor)

**Options**:

**A) Keep current naming** (`*_blipp` / `*_blopp`):
- ✅ Pro: Clearly distinct from old system, signals "this is a subject ID"
- ❌ Con: Non-standard naming, harder to understand
- ❌ Con: What do "blipp" and "blopp" mean?

**B) Standardize to old naming** (`target` / `subject`):
- ✅ Pro: Clear, standard names
- ✅ Pro: Easier to read and understand
- ✅ Pro: Matches old system (easier migration)
- ⚠️ Note: Still contains subject IDs (sids), not entity IDs

**C) Use descriptive naming** (`target_sid` / `actor_sid`):
- ✅ Pro: Very clear what the values represent
- ✅ Pro: Distinguishes target from actor
- ❌ Con: More verbose

**D) Hybrid** (`target` / `actor`):
- ✅ Pro: Clear roles (target vs actor)
- ✅ Pro: Concise
- ❌ Con: Slightly different from old system

**Recommendation**: Option B or D
- If keeping compatibility with old patterns: Use `target` and `subject`
- If improving clarity: Use `target` and `actor`

### 2. Observation Field Names

**Current**:
- `known_as` (worker-side, pre-baking)

**Old system**:
- `knownAs` (worker-side, pre-baking)

**In baked format**: Both use `description_short` ✓

**Question**: Keep `known_as` (snake_case) or revert to `knownAs` (camelCase)?

**Recommendation**: Keep `known_as` - matches codebase style (snake_case)

### 3. Additional Action Fields

**Possible additions**:
```javascript
{
  do: 'look',
  target: 123,
  actor: 456,      // Or subject: 456
  label: 'Look around',

  // Potential additions:
  context?: number,    // Context subject ID (e.g., location where action happens)
  state_id?: number,   // State ID where action is valid
  cost?: number,       // Time/energy cost
  requirements?: [],   // Required conditions
}
```

**Question**: What fields do we need?

**Recommendation**: Start minimal, add as needed:
- Required now: `do`, `target`, `actor`/`subject`, `label`
- Add later: Context, costs, requirements (when implementing those systems)

### 4. Baked Observation Fields

**Current format**:
```javascript
{
  id: number,              // Subject ID
  description_short: string,
  actions: Action[],
  is: 'entity'
}
```

**Possible additions**:
```javascript
{
  id: number,
  description_short: string,
  actions: Action[],
  is: 'entity',

  // Potential additions:
  description_long?: string,    // Detailed description
  primary_descriptor?: {...},   // e.g., Gender entity for humans
  location?: number,            // Subject ID of location
  state?: 'visible'|'known'|'remembered',  // How observed
  traits?: string[],            // Visible trait names
}
```

**Question**: What additional fields would be useful?

**Recommendation**: Add fields as presentation layer needs them:
- `description_long` - When implementing detailed look
- `location` - When showing entity locations
- `state` - When distinguishing observation types
- `traits` - When showing entity properties

---

## Proposed Standard Format

### Worker-side Observation (Pre-baking)

```javascript
/**
 * @typedef {Object} Observation
 * @property {Subject} subject - Subject being observed
 * @property {string} known_as - Display name/designation
 * @property {Action[]} actions - Available actions
 * @property {Subject} [primary_descriptor] - Optional primary descriptor (e.g., gender)
 * @property {boolean} [here] - True if observing current location
 * @property {Observation[]} [inLocation] - Nested observations of contents
 */
```

### Action Format

```javascript
/**
 * @typedef {Object} Action
 * @property {string} do - Command name to execute
 * @property {number} target - Subject ID of target
 * @property {number} actor - Subject ID of actor (who performs action)
 * @property {string} label - Display text for GUI
 */
```

Or, if maintaining old compatibility:
```javascript
/**
 * @typedef {Object} Action
 * @property {string} do - Command name to execute
 * @property {number} target - Subject ID of target
 * @property {number} subject - Subject ID of actor (who performs action)
 * @property {string} label - Display text for GUI
 */
```

### SubjectData (Sent to GUI)

Also known as "baked observation" - the format sent from worker to GUI.

```javascript
/**
 * @typedef {Object} SubjectData
 * @property {number} id - Subject ID (sid)
 * @property {string|null} description_short - Display name
 * @property {Action[]} actions - Available actions (unchanged from Observation)
 * @property {'subject'} is - Type discriminator
 */
```

### main_add Message Format

```javascript
/**
 * @typedef {string | TemplateTagResult} MainAddPart
 */

/**
 * @typedef {Object} TemplateTagResult
 * @property {TemplateStringsArray} strings - String parts
 * @property {SubjectData[]} values - Embedded subject data
 */

// Message format:
['main_add', ...MainAddPart[]]
```

---

## Migration Path

### Phase 1: Standardize Field Names (Current Focus)

**Decide on**:
1. Action field names: `target_blipp`/`subject_blopp` vs `target`/`subject` vs `target`/`actor`
2. Any additional required fields in actions or observations

**Update locations**:
- `public/worker/session.mjs:106-113` - Action creation
- `public/worker/narrator.mjs:78-85` - bake_obs (if needed)
- `public/worker/worker.mjs:40-49` - Message enrichment (when added)

### Phase 2: Add Message Enrichment

**Add resolver** to convert subject IDs → Beliefs before handler execution
- See separate document: `message-enrichment.md`

### Phase 3: Extend Format (As Needed)

**Add fields** when implementing:
- Detailed descriptions
- Location tracking in observations
- Action requirements/costs
- Multiple descriptor support

---

## Summary

### Documentation Complete ✓

All message formats have been documented:

**Worker → Client messages**:
- ✅ `main_add` - Add content with embedded subjects
- ✅ `main_clear` - Clear content
- ✅ `header_set` - Update header
- ✅ `topic_update` - Update existing subject (renamed from subject_update)
- ✅ `ack` - Acknowledge command completion with result

**Client → Worker messages**:
- ✅ `start` - Initialize session (special handling, no ack)
- ✅ `ping` - Check worker alive (returns 'pong' via ack)
- ✅ Action commands - User actions with ackid

**Data formats**:
- ✅ Observation object (worker-side, pre-baking)
- ✅ SubjectData (baked observation sent to GUI)
- ✅ Action object format
- ✅ Template tag result format

### Current Terminology ✓

Updated to reflect current code:
- ✅ `bake_obs()` → `bake_narration()`
- ✅ `is: 'entity'` → `is: 'subject'`
- ✅ `subject_update` → `topic_update`
- ✅ `BakedObservation` typedef → `SubjectData`

### Format Consistency ✅ FIXED

- ✅ All messages now use array format consistently
- ✅ `ping` now returns `'pong'` via ack mechanism (no separate pong message)
- ✅ Removed separate `pong` handler - uses standard ack response
- ✅ Tests updated and passing (355 tests)
- ✅ String→array conversion kept for backwards compatibility

### Key Decision Points

**1. ~~Message format consistency~~** ✅ FIXED:
- All messages use array format
- No more inconsistencies

**2. Action field naming** (DEFERRED - DO LAST):
- Current: `target_blipp`/`subject_blopp`
- Old system: `target`/`subject`
- **Note**: User said this comes LAST

**3. Additional fields** (FUTURE):
- Start minimal, add as needed
- Potential: description_long, location, traits, etc.

### Completed Steps

1. ✅ **Documented all message formats**
   - All Worker→Client messages documented
   - All Client→Worker messages documented
   - Compared with old system

2. ✅ **Fixed format consistency**:
   - Changed `ping` to return `'pong'` via ack mechanism
   - Removed separate `pong` message type
   - Updated tests
   - All 355 tests passing

### Next Steps

1. **Continue with plan Steps 2-4** (if needed):
   - Old system reference (if more detail needed)
   - Terminology clarification (mostly done)
   - GUI requirements documentation

2. **Action field names** (LAST):
   - Rename `target_blipp`/`subject_blopp`
   - Update session.mjs and tests
