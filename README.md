# Adventure Alpha Zero

> A systemic story game - exploring how to make story interactive the way systemic environments make tactics interactive

## 🎯 The Vision

Traditional game development presents a false choice: **player freedom** OR **meaningful story**. Linear narratives sacrifice agency. Branching narratives create exponential dev costs and still railroad players. Sandbox games give tactical freedom but narrative emptiness.

**Systemic Story** rejects this compromise. Just as systemic environments (Zelda, Deus Ex, RimWorld) give players tactical freedom through consistent object properties and emergent interactions, **Systemic Story encodes all parts of the story as interactive systems**. The story adapts continuously as a possibility-space using rules of story structure and theme.

This is different from branching narrative (pre-authored paths), emergent narrative (player apophenia), or procedural quests (template fill-ins). It's a top-down director AI merged with bottom-up simulation, where story templates guide constraint satisfaction to maintain narrative coherence while allowing genuine player agency.

## 📖 What is Systemic Story?

> "A systemic game features interactions governed by the intrinsic properties of objects and the environment, ensuring consistent, dynamic responses from all gameplay mechanics and interactions throughout, emphasizing emergent gameplay, allowing for multiple solutions beyond designer-intended paths."

**Systemic Story** applies this principle to narrative:

- **All story elements** encoded as interactive systems (not hand-written branches)
- **Possibility-space management** using story structure and theme rules
- **Top-down adaptation** merges with bottom-up NPC simulation
- **Template-driven** but responsive to player investigation paths
- **Constraint satisfaction** maintains narrative coherence

Think of it like a table-top D&D module: locations, characters, scenarios described; some expected events prepared; but the player can always do something not covered by the module. The game adapts.

## 🚧 Status

**Pre-Alpha 1** - Building belief architecture foundation. Not playable yet.

**Roadmap**: 9 Alphas building from data foundation → story systems
- Alpha 1: **Beliefs** (current)
- Alpha 2-9: Relationships → Quests → Goals → Threads → Psychology → Planning → Sociology → Grounding

## ⚙️ The Architecture

The system is built from interconnected classes. Each one addresses a fundamental challenge of interactive narrative.

### [Logos](public/worker/logos.mjs) - Ground of Being

**Logos** is the primordial Mind. Parent of all minds. The One from which everything emerges.

**Relationships**: Logos has parent=null (root of hierarchy). All other Minds descend from Logos. Has origin_state (Timeless) with ground_state=null.

**What this enables**: Complete fractal structure. Just as NPCs have minds containing minds, the universe itself is a Mind. Everything is mind - from the cosmos to individual thoughts. Unified hierarchy with clear root.

**Why**: Stories happen in a context. That context needs a foundation. Logos is that foundation - the ground of being from which all narrative emerges. Not just philosophical - enables queries like "what exists in the universe?" to work structurally. Mind hierarchy needs a root. Completes the fractal design.

### [Mind](public/worker/mind.mjs) - Where Stories Live

**Mind** is where knowledge exists. The world is a Mind. Each NPC has a Mind. Those minds can contain other Minds - an NPC's model of what another NPC knows.

**Relationships**: Mind contains States. States contain Beliefs. A Belief can reference another Mind (theory of mind). Every Mind descends from Logos.

**What this enables**: NPCs model what others know. Deception becomes structural - "I know X, but I want you to think Y" is literally two Minds with different Beliefs. Investigation works - "who knew what, when?" queries across nested Minds. Social reasoning emerges - "Does Bob know that Alice saw him?" is navigating Mind references.

**Why**: Drama requires hidden agendas. Traditional "knowledge flags" per NPC don't scale - you'd need exponential combinations. Nested Minds make theory of mind structural. The data itself encodes who believes what about whom.

### [Belief](public/worker/belief.mjs) - The Atoms of Knowledge

**Belief** is one piece of knowledge about one thing, at one point in time. Immutable. Changes create new Beliefs that inherit from old ones.

**Relationships**: Beliefs live in States. Each Belief is about a Subject (what it's about). Beliefs can have bases (inheritance chain). Beliefs have Traittypes (what properties they have).

**What this enables**: Memory - "What did I believe yesterday?" Testimony - "When did you learn this?" Timeline reconstruction - "Who knew first?" Adaptive storytelling - possibilities stay open (like a DM keeping options) until player observation creates a new Belief, collapsing the choice.

**Why**: Detective stories need temporal reasoning. "When did the witness see the suspect?" requires queryable history. Mutation destroys that. Immutable versioning creates the history automatically - the chain of Beliefs *is* the timeline. The world and NPC minds are made of the same stuff because stories decompose the same way at every level. A season is episodes is scenes. The world is Minds is Beliefs. Fractal structure.

### [State](public/worker/state.mjs) - Snapshots of Possibility

**State** is one Mind's knowledge at one moment. A container of Beliefs at specific transaction time (when created) and valid time (what moment it's about).

**Relationships**: States live in Minds. States contain Beliefs. States can have ground_state (what world state they're about - nested mind coordination).

**What this enables**: Bitemporal reasoning. Memory (vt before tt). Planning (vt after tt). Superposition (multiple States at same tt, different possibilities). Character switching - each character is a different Mind, States show their perspective at each moment.

**Why**: "When did you learn X?" vs "What did you know then?" - simple timestamps conflate when-created and when-about. Bitemporal separation makes both queryable. Branching possibilities and alternate timelines work because States are immutable - timelines don't overwrite each other.

### [Subject](public/worker/subject.mjs) - Identity Across Time

**Subject** is the persistent identity of a thing. The suspect, the hammer, the location. Beliefs about that Subject version over time, but the Subject identity remains.

**Relationships**: Multiple Beliefs can be about the same Subject (versioning). Subjects are scoped to a Mind (enables same name in different contexts).

**What this enables**: "The suspect" remains the same entity even as different NPCs form different Beliefs about them. Temporal queries work - find all Beliefs about this Subject across time. Witnesses can reference the same person with incomplete/conflicting descriptions.

**Why**: Miscommunication drives investigation. Witnesses describe "someone in a hood" - that description can match multiple Subjects, or be wrong about which Subject. The identity persists while knowledge about it varies. Foundation for mystery.

### [Traittype](public/worker/traittype.mjs) - How Knowledge Composes

**Traittype** defines what properties Beliefs can have and how they combine. Some traits are composable (merge from multiple inheritance paths). Some are singular (first-wins).

**Relationships**: Traittypes define structure of Beliefs. Beliefs have traits (key-value pairs). Composable traits use special composition logic (arrays merge, Minds compose via state merging).

**What this enables**: Multiple inheritance without conflicts. Knight inherits from Warrior + Defender, gets both inventories. Detective in multiple factions has contacts from all. Cultural knowledge + personal knowledge = complete NPC.

**Why**: Stories need characters with complex backgrounds. Single inheritance forces artificial choices. Composable traits make it natural - the detective IS both a cop and an informant's friend. The data model handles the combination structurally.

### [Archetype](public/worker/archetype.mjs) - Templates for Creation

**Archetype** is a template for creating Beliefs. Cultural prototypes (Villager, Hunter, Merchant). No Mind, no State - pure template.

**Relationships**: Beliefs can inherit from Archetypes (bases chain). Archetypes define default traits. Archetypes can have bases (multiple inheritance of templates).

**What this enables**: On-demand NPC creation. Cultural consistency. Shared defaults without duplication.

**Why**: Can't pre-generate every NPC. Archetypes are the "class definition" - Beliefs are instances. Create "Villager" archetype once, instantiate hundreds of villagers. Each gets default knowledge, override what matters. Scales because prototypes share structure.

### [Eidos](public/worker/eidos.mjs) - Realm of Universal Prototypes

**Eidos** is the Mind where universal prototypes live. Timeless, shared across all game worlds. The realm of forms - ideal templates that stories instantiate.

**Relationships**: Eidos is a singleton Mind descending from Logos. Contains shared Beliefs (prototypes). Game worlds reference Eidos prototypes via inheritance.

**What this enables**: Shared story templates across playthroughs. Universal character archetypes (the Mentor, the Rival). Cultural knowledge that persists (wolves are dangerous, blacksmiths work metal). Scenarios can reference Eidos prototypes without duplicating them.

**Why**: Stories reuse patterns. The "jealous lover" exists as a pattern independent of any specific story. Eidos holds these universals. Each game world instantiates its own version (this jealous lover, in this village, with these details). Separation between universal patterns and specific instances. Like Plato's realm of forms - the perfect template exists outside any particular story.

### [Session](public/worker/session.mjs) - Your Connection to the World

**Session** represents your current connection to the game. What world you're in, what moment in time, what character you play.

**Relationships**: Session has a world (Mind), current state (State), and player (Belief). Coordinates with Channel for live updates.

**What this enables**: Game saves and loads. Character switching. Time travel - rewind to earlier state. Perspective switching - same world, different viewpoint. Multiple simultaneous players.

**Why**: Players need entry points. Session is that interface - "this is your connection to the story." Not just data - active relationship. When state changes, observers get notified. Foundation for save/load and multiplayer.

### [Channel](public/worker/channel.mjs) - Communication Architecture

**Channel** is the communication layer using Web Workers and BroadcastChannel. Game logic runs in worker thread, UI connects via channel messages.

**Relationships**: Worker thread hosts the simulation. Channel bridges to inspection UI. Session broadcasts state changes. Dispatch handlers answer queries about minds, states, and beliefs.

**What this enables**: Live inspection while game runs. Debug the mind hierarchy in real-time. UI stays responsive (worker doesn't block). Multiple tools can connect simultaneously.

**Why**: Systemic games are complex. Need tools to understand what's happening. Traditional debuggers don't show "what does this NPC believe?" Channel makes the simulation observable. Worker architecture keeps game logic isolated from UI concerns.

### [World](public/worker/world.mjs) - The Starting Scenario

**World** is how scenarios get initialized. Register archetypes and traittypes, create world Mind, populate initial state with beliefs, create Session.

**Relationships**: Uses all the classes above. Defines what archetypes exist (Person, Location, PortableObject), what traits they can have, creates initial beliefs (village, workshop, NPCs), hands you a Session to play.

**What this enables**: Scenario authoring. Different starting situations. Modding support. Test scenarios for development. Each world is a fresh story instantiated from Eidos templates.

**Why**: Stories need beginnings. World is that setup - "here's the village, here are the NPCs, here's what they know." Not hardcoded - data-driven scenario definition. Create new adventures by writing new world definitions.

---

### Why This Architecture

The data model encodes the building blocks of drama.

**Branching possibilities** (Belief versioning, State temporality): Drama requires uncertainty. What the witness saw, what they believe happened, what actually happened - these can all differ. Miscommunication drives investigation. Traditional game state has one truth. This architecture has possibilities that collapse through observation, like a DM keeping options open.

**Nested minds** (Mind contains Mind): Drama is hidden agendas. What Bob knows, what Bob thinks Alice knows, what Bob wants you to think he knows. Deception, manipulation, social reasoning. Traditional NPCs have knowledge tags. This architecture makes theory of mind structural - the data itself encodes who believes what about whom.

**Unified model** (world and minds are both Beliefs): Stories decompose the same way at every level. A season is episodes is scenes. The world is Minds is Beliefs. Not "world state + NPC knowledge" as separate systems - one unified model because stories work that way. Fractal structure enables the same tools to work at every scale.

**Why detective stories**: Crime novels decompose into the primitives. Miscommunication (incomplete/wrong information), hidden agendas (lies, motivations), emotions driving action (jealousy → murder → cover-up). These aren't crime-specific - they're the building blocks of ALL stories. Start here, expand from the foundation.

## 📚 Learn More

**Systemic Story blog series**: https://blog.jonas.liljegren.org/tag/systemic/

**Data model**: [SPECIFICATION.md](docs/SPECIFICATION.md)

**Contact**: https://blog.jonas.liljegren.org/contact/

## 🎮 Prior Work

**Systemic depth proven**: NetHack, Dwarf Fortress, RimWorld, The Sims

**Related attempts**: Wildermyth (template slots), Watch Dogs Legion (procedural NPCs), The Wayward Realms (Virtual Game Master), Ken Levine's Narrative Legos (Judas)

---

*"It has been 30 years and there is still no game that has managed to surpass NetHack."*

Let's change that by bringing systemic depth to narrative.
