# Terminology: Topic, Subject, Entity, Observation

Clarifying the overloaded terms used across GUI and worker.

---

## The Problem

The word **"subject"** is used in two completely different contexts:
1. **GUI subject** - Data attached to a topic (any payload)
2. **Data model Subject** - Persistent identity class with sid

The word **"entity"** is also overloaded:
1. **Baked observation entity** - `{is: 'entity'}` format for GUI
2. **Old system Entity** - Mutable entity class (no longer used)

Let's define each term clearly.

---

## GUI Layer Terms

### Topic

**What it is**: Interactive GUI element that can be clicked/selected

**Code location**: `public/lib/gui.mjs`

**Structure**:
```javascript
{
  id: number,           // Local ID within parent menu
  parent: Menu,         // Parent menu
  subject: any,         // The payload (see below)
  slug: string,         // Global ID like "main-5"
  element?: HTMLElement // DOM element when rendered
}
```

**Examples**:
- Clickable entity in narrative: `{subject: BakedObservation}`
- Clickable action in menu: `{subject: ActionObject}`
- "Never mind" option: `{subject: {do:'abort', label:'Never mind'}}`

**Key insight**: Topic is a GUI wrapper around any clickable thing.

### GUI Subject

**What it is**: The data/payload attached to a topic

**Code location**: `topic.subject` in `gui.mjs`

**Can be**:
1. **Baked Observation** - Represents an entity in the world
2. **Action Object** - Represents an action to perform

**Structure varies**:
```javascript
// Baked Observation (when is: 'entity')
{
  id: 123,
  description_short: 'courtyard',
  actions: [...],
  is: 'entity'
}

// Action Object (when do: ...)
{
  do: 'look',
  label: 'Look around',
  target_blipp: 123,
  subject_blopp: 456
}
```

**Usage in code**:
```javascript
// gui.mjs:90
const subj = Topic.topics[slug].subject;
if( subj.is !== 'entity' ) continue;  // Is it a baked observation?

// gui.mjs:237
const action = subj.do || null;  // Is it an action?
```

**Confusing name**: Yes! "subject" here means "the thing the topic is about", not the data model Subject class.

---

## Worker Layer Terms

### Subject (Data Model)

**What it is**: Persistent identity across states

**Code location**: `public/worker/subject.mjs`

**Structure**:
```javascript
class Subject {
  sid: number,              // Stable subject ID
  belief_history: Belief[], // All belief instances
  // ...

  get_belief_by_state(state): Belief
}
```

**Purpose**: Stable reference to a "thing" that can exist in multiple states

**Examples**:
- Catalina (NPC) is a Subject with sid 123
- Same Subject exists as different Beliefs in different states
- Actions reference subjects via sid

**Key insight**: Subject = identity, Belief = state-specific instance

### Belief

**What it is**: State-specific instance of a subject

**Code location**: `public/worker/belief.mjs`

**Structure**:
```javascript
class Belief {
  _id: number,          // Unique belief ID
  subject: Subject,     // Which subject this is a belief about
  in_mind: Mind,        // Which mind holds this belief
  // ... traits, data

  get_label(): string
  get_trait(state, name): any
}
```

**Purpose**: Represents how a subject appears in a specific state/mind

**Examples**:
- Player's belief about Catalina in current state
- Catalina's belief about herself in current state
- Each is a different Belief instance

**Key insight**: Multiple Beliefs can exist for same Subject in same State (different minds)

### Observation (Pre-baking)

**What it is**: Worker-side description of what's observed

**Code location**: Created in worker, e.g., `session.mjs:103-114`

**Structure**:
```javascript
{
  subject: Subject,         // Subject instance (data model)
  known_as: string,         // Display name
  actions: Action[],        // Available actions

  // Optional:
  primary_descriptor?: Subject,
  here?: boolean,
  inLocation?: Observation[]
}
```

**Purpose**: Intermediate format before sending to GUI

**Example**:
```javascript
const obs = {
  subject: location_subject,  // Subject instance
  known_as: 'courtyard',
  actions: [
    {do: 'look', target_blipp: 123, subject_blopp: 456, label: 'Look around'}
  ]
}
```

**Key insight**: Contains Subject instance (data model), not yet ready for GUI

### Baked Observation

**What it is**: GUI-ready format of an observation

**Code location**: Created by `narrator.mjs:78-85`

**Structure**:
```javascript
{
  id: number,               // Subject's sid
  description_short: string,// Display text
  actions: Action[],        // Actions (unchanged)
  is: 'entity'              // Type marker
}
```

**Created by**:
```javascript
function bake_obs(obs) {
  return {
    id: obs.subject.sid,           // Extract sid
    description_short: obs.known_as,
    actions: obs.actions,
    is: 'entity'
  }
}
```

**Purpose**: Ready to send to GUI, no worker objects

**Key insight**: "Baked" = converted from worker format to wire format

### "Entity" (in baked observation)

**What it is**: A type marker, not a class

**Where used**: `is: 'entity'` in baked observations

**Purpose**: Tells GUI "this is a baked observation, not an action"

**Code usage**:
```javascript
// gui.mjs:91
if( subj.is !== 'entity' ) continue;  // Skip if not baked observation
```

**Not to be confused with**:
- Old system Entity class (no longer used)
- Just means "baked observation type"

---

## The Overloading Problem

### "Subject" means two things:

```javascript
// In GUI (gui.mjs:90):
const subj = topic.subject;  // Could be BakedObservation or ActionObject

// In worker (session.mjs:100):
const pl = this.player.subject;  // Subject class instance
```

**Solution needed**: Use clearer names in one or both contexts

### "Entity" means two things:

```javascript
// Old system:
class Entity { ... }  // Mutable entity class

// New system:
{is: 'entity'}  // Just a type marker in baked observation
```

**Solution needed**: Maybe rename `is: 'entity'` to `is: 'observation'`?

---

## Data Flow

### Worker → GUI

```
1. Subject (data model)
   ↓
2. Observation {subject: Subject, known_as, actions}
   ↓ bake_obs()
3. Baked Observation {id: sid, description_short, actions, is: 'entity'}
   ↓ postMessage(['main_add', tt`...`])
4. Template Tag {strings, values: [BakedObservation]}
   ↓ GUI receives
5. GUI Subject (topic.subject) = BakedObservation
   ↓ user clicks
6. Topic selected
```

### GUI → Worker

```
1. User clicks topic
   ↓
2. Topic has subject (BakedObservation or ActionObject)
   ↓ if baked observation
3. Show menu of actions
   ↓ user clicks action
4. Action Object {do, label, target_blipp, subject_blopp, ...}
   ↓ Message.send(action.do, action)
5. Worker receives ['look', {do:'look', target_blipp:123, ...}, ackid]
   ↓ (enrichment needed here!)
6. Resolve target_blipp (123) → Subject → Belief
   ↓
7. Handler receives {actor: Belief, target: Belief, state: State}
```

---

## Proposed Terminology Changes

### Option 1: Rename GUI "subject" → "payload"

```javascript
// gui.mjs
const topic = {
  payload: any,  // Was: subject
  // ...
}

// Clearer in code:
const payload = Topic.topics[slug].payload;
if( payload.is !== 'entity' ) continue;
```

**Pro**: No confusion with data model Subject
**Con**: Breaks existing code

### Option 2: Rename data model "Subject" → "Identity"

```javascript
// New name
class Identity {
  sid: number,
  get_belief_by_state(state): Belief
}

// Actions
{do: 'look', target: 123}  // Identity ID (was subject ID)
```

**Pro**: Clearer meaning
**Con**: Big refactor, "Subject" is already in use

### Option 3: Keep but document clearly

**Pro**: No code changes
**Con**: Must remember context

### Option 4: Rename `is: 'entity'` → `is: 'observation'`

```javascript
// Baked observation
{
  id: 123,
  description_short: 'courtyard',
  actions: [...],
  is: 'observation'  // Was: 'entity'
}

// Code changes needed:
if( subj.is !== 'observation' ) continue;
```

**Pro**: More accurate ("observation" vs old "entity")
**Con**: Small breaking change

---

## Summary Table

| Term | Context | Meaning |
|------|---------|---------|
| **Topic** | GUI | Interactive element user can click |
| **subject** | GUI code | Data payload of a topic |
| **Subject** | Data model | Persistent identity (class with sid) |
| **Belief** | Data model | State-specific instance of Subject |
| **Observation** | Worker | Pre-baking format with Subject instance |
| **Baked Observation** | Wire format | GUI-ready format with sid |
| **is: 'entity'** | Baked obs | Type marker meaning "this is a baked observation" |
| **Entity** | Old system | Deprecated mutable entity class |

---

## What Needs to Change?

### Minimal Changes (Recommended)

1. **Keep current names** but document clearly
2. **Change `is: 'entity'` → `is: 'observation'`** for accuracy
   - Update: `narrator.mjs:84`
   - Update: `gui.mjs:91`
3. **Add JSDoc comments** everywhere to clarify context:
   ```javascript
   /**
    * @param {Subject} subject - Data model Subject, not GUI subject!
    */
   ```

### Future Refactor (If time permits)

1. **Rename GUI `topic.subject` → `topic.payload`**
   - Clearer separation from data model Subject
   - Requires updating `gui.mjs` (~20 locations)

2. **Consider**: Rename data model `Subject` → `Identity`
   - Even clearer semantics
   - Major refactor across codebase

---

## Decision Points

1. **Keep `is: 'entity'` or change to `is: 'observation'`?**
   - Current: `is: 'entity'` (misleading, suggests old Entity class)
   - Proposed: `is: 'observation'` (accurate, describes what it is)

2. **Keep GUI `topic.subject` or rename to `topic.payload`?**
   - Current: `topic.subject` (confusing with data model)
   - Proposed: `topic.payload` (clear distinction)

3. **Just document or actually refactor?**
   - Minimal: Add comments, change `is` field
   - Full: Rename overloaded terms

What do you want to tackle?
