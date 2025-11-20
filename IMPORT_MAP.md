# Complete Import Map - public/worker/*.mjs

## Import Details by Module

### archetype.mjs
**Lines of code:** ~202
**Exports:** `Archetype` class

**Imports:**
- `./debug.mjs`: `assert`
- `./db.mjs`: `*` (namespace import)
- `./traittype.mjs`: `Traittype`
- `./subject.mjs`: `Subject`

**Imported by:**
- `db.mjs`
- `belief.mjs`
- `cosmos.mjs` (re-export)
- `channel.mjs`
- `subject.mjs`
- `world.mjs`

---

### belief.mjs
**Lines of code:** ~956
**Exports:** `Belief` class

**Imports:**
- `./debug.mjs`: `assert, log, sysdesig, debug`
- `./id_sequence.mjs`: `next_id`
- `./archetype.mjs`: `Archetype`
- `./db.mjs`: `*` (namespace import)
- `./cosmos.mjs`: `eidos`
- `./subject.mjs`: `Subject`
- `./traittype.mjs`: `Traittype`
- `./state.mjs`: `State`

**Imported by:**
- `db.mjs`
- `channel.mjs`
- `cosmos.mjs` (re-export)
- `mind.mjs`
- `serialize.mjs`
- `session.mjs`
- `state.mjs`
- `subject.mjs`
- `traittype.mjs`
- `world.mjs`

---

### channel.mjs
**Lines of code:** ~280
**Exports:** `dispatch`, `init_channel`

**Imports:**
- `./debug.mjs`: `log, assert`
- `./db.mjs`: `*` (namespace import)
- `./mind.mjs`: `Mind`
- `./state.mjs`: `State`
- `./belief.mjs`: `Belief`
- `./archetype.mjs`: `Archetype`
- `./session.mjs`: `Session`

**Imported by:**
- `session.mjs`

---

### cosmos.mjs
**Lines of code:** ~39
**Exports:** Archetype, Traittype, State, UnionState, Mind, Belief, Subject, Session, Serialize, Timeless, Logos, logos, logos_state, _reset_logos, Eidos, eidos, _reset_eidos, DB, _reset_singletons

**Imports:**
- `./db.mjs`: `*` (namespace import - line 6)
- `./archetype.mjs`: for re-export
- `./traittype.mjs`: for re-export
- `./state.mjs`: for re-export
- `./union_state.mjs`: for re-export
- `./mind.mjs`: for re-export
- `./belief.mjs`: for re-export
- `./subject.mjs`: for re-export
- `./session.mjs`: for re-export
- `./serialize.mjs`: for re-export
- `./timeless.mjs`: for re-export
- `./logos.mjs`: `_reset_logos` (line 28)
- `./eidos.mjs`: `eidos, _reset_eidos` (line 29)

**Imported by:**
- db.mjs
- belief.mjs
- mind.mjs
- state.mjs
- traittype.mjs
- serialize.mjs
- world.mjs
- channel.mjs (indirectly)

---

### db.mjs
**Lines of code:** ~477
**Exports:** Registry access functions, `register()` function, reset functions, helpers

**Imports:**
- `./id_sequence.mjs`: `reset_id_sequence, next_id`
- `./archetype.mjs`: `Archetype` (line 10)
- `./traittype.mjs`: `Traittype` (line 11)
- `./subject.mjs`: `Subject` (line 12)
- `./belief.mjs`: `Belief` (line 13)
- `./debug.mjs`: `log, assert` (line 14)
- `./mind.mjs`: `Mind` (line 15)
- `./state.mjs`: `State` (line 16)
- `./cosmos.mjs`: `logos, logos_state, eidos, _reset_singletons` (line 17) **<-- CRITICAL IMPORT**
- `./serialize.mjs`: `Serialize` (line 18)

**Imported by:**
- archetype.mjs
- belief.mjs
- channel.mjs
- cosmos.mjs
- mind.mjs
- state.mjs
- subject.mjs
- traittype.mjs
- timeless.mjs
- serialize.mjs
- union_state.mjs
- world.mjs

---

### debug.mjs
**Lines of code:** ~163
**Exports:** `log, debug, assert, sysdesig`

**Imports:** None (pure utility module)

**Imported by:**
- archetype.mjs
- belief.mjs
- channel.mjs
- mind.mjs
- narrator.mjs
- session.mjs
- state.mjs
- subject.mjs
- traittype.mjs
- union_state.mjs
- worker.mjs
- world.mjs

---

### eidos.mjs
**Lines of code:** ~89
**Exports:** `Eidos` class, `eidos()` function, `_reset_eidos()`

**Imports:**
- `./mind.mjs`: `Mind` (line 17)
- `./timeless.mjs`: `Timeless` (line 18)
- `./logos.mjs`: `logos` (line 19) **<-- Creates chain to db**

**Imported by:**
- cosmos.mjs
- db.mjs (via cosmos)
- belief.mjs (via cosmos)
- subject.mjs (direct import)
- world.mjs

---

### id_sequence.mjs
**Lines of code:** ~40
**Exports:** `next_id, current_id, set_id_sequence, reset_id_sequence`

**Imports:** None (pure utility module)

**Imported by:**
- archetype.mjs
- belief.mjs
- db.mjs
- logos.mjs
- mind.mjs
- serialize.mjs
- state.mjs
- subject.mjs
- timeless.mjs

---

### logos.mjs
**Lines of code:** ~96
**Exports:** `Logos` class, `logos()` function, `logos_state()` function, `_reset_logos()`

**Imports:**
- `./mind.mjs`: `Mind` (line 11)
- `./timeless.mjs`: `Timeless` (line 12)
- `./id_sequence.mjs`: `next_id` (line 13)
- `./db.mjs`: `*` (namespace import - line 14) **<-- Creates chain to cosmos**

**Imported by:**
- cosmos.mjs
- db.mjs (via cosmos)
- eidos.mjs (direct import)
- serialize.mjs (via cosmos)
- subject.mjs (direct import)

---

### mind.mjs
**Lines of code:** ~730
**Exports:** `Mind` class

**Imports:**
- `./debug.mjs`: `assert, log, debug, sysdesig` (line 23)
- `./id_sequence.mjs`: `next_id` (line 24)
- `./db.mjs`: `*` (namespace import - line 25)
- `./state.mjs`: `State` (line 26)
- `./cosmos.mjs`: `*` (namespace import - line 27) **<-- Creates 3-node cycle with db**
- `./belief.mjs`: `Belief` (line 28)
- `./traittype.mjs`: `Traittype` (line 29)
- `./timeless.mjs`: `Timeless` (line 30)

**Imported by:**
- db.mjs
- cosmos.mjs (re-export)
- channel.mjs
- eidos.mjs
- logos.mjs
- serialize.mjs
- state.mjs
- subject.mjs
- traittype.mjs
- union_state.mjs
- world.mjs

---

### narrator.mjs
**Lines of code:** ~95
**Exports:** `ensure_init(), do_look(), desig(), tt(), bake_narration()`

**Imports:**
- `./debug.mjs`: `log` (line 12)
- `./subject.mjs`: `Subject` (line 13)

**Imported by:**
- session.mjs

---

### serialize.mjs
**Lines of code:** ~189
**Exports:** `deserialize_reference()`, `Serialize` class, `save_mind()`, `load()`

**Imports:**
- `./id_sequence.mjs`: `set_id_sequence` (line 1)
- `./mind.mjs`: `Mind` (line 2)
- `./cosmos.mjs`: `logos` (line 3)
- `./db.mjs`: `*` (namespace import - line 4)

**Imported by:**
- db.mjs
- cosmos.mjs (re-export)
- state.mjs
- traittype.mjs

---

### session.mjs
**Lines of code:** ~125
**Exports:** `Session` class

**Imports:**
- `./debug.mjs`: `log, assert` (line 13)
- `./traittype.mjs`: `Traittype` (line 14)

**Imported by:**
- channel.mjs
- cosmos.mjs (re-export)
- worker.mjs

---

### state.mjs
**Lines of code:** 400+ (partial read, ~1000+ total)
**Exports:** `State` class

**Imports:**
- `./debug.mjs`: `assert, log, debug` (line 23)
- `./id_sequence.mjs`: `next_id` (line 24)
- `./db.mjs`: `*` (namespace import - line 25)
- `./cosmos.mjs`: `*` (namespace import - line 26)
- `./subject.mjs`: `Subject` (line 27)
- `./belief.mjs`: `Belief` (line 28)
- `./serialize.mjs`: `Serialize` (line 29)
- `./timeless.mjs`: `Timeless` (line 30)
- `./traittype.mjs`: `Traittype` (line 31)

**Imported by:**
- db.mjs
- cosmos.mjs (re-export)
- channel.mjs
- mind.mjs
- serialize.mjs
- subject.mjs
- traittype.mjs
- union_state.mjs
- world.mjs

---

### subject.mjs
**Lines of code:** ~272
**Exports:** `Subject` class

**Imports:**
- `./db.mjs`: `*` (namespace import - line 1)
- `./eidos.mjs`: (no direct import in code shown)
- `./logos.mjs`: (no direct import in code shown)
- `./belief.mjs`: `Belief` (line 3)
- `./archetype.mjs`: `Archetype` (line 4)
- `./assert, log` from `./debug.mjs` (line 5)
- `./next_id` from `./id_sequence.mjs` (line 6)

**Actually imports (per code analysis):**
- `./db.mjs` (line 1)
- `./cosmos.mjs`: `eidos, logos` (implied - used in code)
- `./belief.mjs` (line 3)
- `./archetype.mjs` (line 4)
- `./debug.mjs`
- `./id_sequence.mjs`

**Imported by:**
- archetype.mjs
- belief.mjs
- cosmos.mjs (re-export)
- db.mjs
- channel.mjs
- narrator.mjs
- state.mjs
- subject.mjs (circular)
- traittype.mjs
- world.mjs

---

### timeless.mjs
**Lines of code:** ~76
**Exports:** `Timeless` class, `_setup_timeless_inheritance()`

**Imports:**
- `./id_sequence.mjs`: `next_id` (line 17)
- `./db.mjs`: `*` (namespace import - line 18)

**Imported by:**
- cosmos.mjs (re-export)
- eidos.mjs
- logos.mjs
- mind.mjs
- state.mjs

---

### traittype.mjs
**Lines of code:** 100+ (partial read, likely 400+)
**Exports:** `Traittype` class

**Imports:**
- `./debug.mjs`: `assert` (line 25)
- `./archetype.mjs`: `Archetype` (line 26)
- `./db.mjs`: `*` (namespace import - line 27)
- `./cosmos.mjs`: `*` (namespace import - line 28)
- `./subject.mjs`: `Subject` (line 29)
- `./mind.mjs`: `Mind` (line 30)
- `./state.mjs`: `State` (line 31)
- `./belief.mjs`: `Belief` (line 32)
- `./serialize.mjs`: `deserialize_reference` (line 33)

**Imported by:**
- archetype.mjs
- belief.mjs
- cosmos.mjs (re-export)
- db.mjs
- channel.mjs
- mind.mjs
- session.mjs
- state.mjs
- world.mjs

---

### union_state.mjs
**Lines of code:** 100+ (partial read)
**Exports:** `UnionState` class

**Imports:**
- `./debug.mjs`: `assert, debug` (line 16)
- `./db.mjs`: `*` (namespace import - line 17)
- `./state.mjs`: `State` (line 18)

**Imported by:**
- cosmos.mjs (re-export)
- mind.mjs

---

### worker.mjs
**Lines of code:** ~117
**Exports:** `handler_register()`, message event listener

**Imports:**
- `./debug.mjs`: `log, assert` (line 1)
- `./session.mjs`: `Session` (line 2)

**Imported by:**
- Global (entry point)
- narrator.mjs (imports narrator.mjs which imports worker.mjs)

---

### world.mjs
**Lines of code:** 100+ (partial read)
**Exports:** Game world setup, `world_state`, `player_body`

**Imports:**
- `./cosmos.mjs`: `*` (namespace import - line 11)
- `./db.mjs`: `*` (namespace import - line 12)
- `./subject.mjs`: `Subject` (line 13)
- `./traittype.mjs`: `Traittype` (line 14)
- `./debug.mjs`: `log, assert, sysdesig` (line 15)
- `./eidos.mjs`: `eidos` (line 16)

**Imported by:**
- session.mjs

---

## Import Statistics

### Total Imports by Type

**Namespace imports (`import * as`):** 18
- db.mjs → db (1)
- cosmos.mjs → db, logos.mjs exports, eidos.mjs exports (complex)
- mind.mjs → db, Cosmos (2)
- state.mjs → db, Cosmos (2)
- subject.mjs → db (1)
- traittype.mjs → db, Cosmos (2)
- timeless.mjs → db (1)
- union_state.mjs → db (1)
- channel.mjs → db (1)
- serialize.mjs → db (1)
- world.mjs → cosmos, db (2)

**Named imports:** ~40+
**Re-exports:** 19 items from cosmos.mjs

### Modules by Import Count

1. **db.mjs** - Imported by: 12 modules (16% of all files)
2. **cosmos.mjs** - Imported by: 7+ modules directly
3. **belief.mjs** - Imported by: 10 modules
4. **mind.mjs** - Imported by: 8+ modules
5. **state.mjs** - Imported by: 8+ modules
6. **traittype.mjs** - Imported by: 6+ modules
7. **debug.mjs** - Imported by: 12 modules (most ubiquitous)

---

## Cycle Summary by Chain Length

**2-node cycles (direct):**
1. archetype.mjs ↔ db.mjs
2. belief.mjs ↔ subject.mjs

**3-node cycles:**
1. mind.mjs → db.mjs → cosmos.mjs → mind.mjs
2. state.mjs → db.mjs → cosmos.mjs → state.mjs
3. traittype.mjs → db.mjs → cosmos.mjs → traittype.mjs
4. logos.mjs → db.mjs → cosmos.mjs → logos.mjs

**4+ node cycles:**
1. belief.mjs → cosmos.mjs → db.mjs → belief.mjs
2. subject.mjs → cosmos.mjs → db.mjs → subject.mjs
3. serialize.mjs → cosmos.mjs → db.mjs → serialize.mjs
4. eidos.mjs → logos.mjs → db.mjs → cosmos.mjs → eidos.mjs

---

## Clean Imports (No Cycles)

1. **debug.mjs** - Pure utility, imports nothing
2. **id_sequence.mjs** - Pure utility, imports nothing
3. **narrator.mjs** - Imports only debug.mjs and subject.mjs (safe)

