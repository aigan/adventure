# Roadmap

## Development Stages

| Alpha | Focus |
|-------|-------|
| Alpha 1 | Beliefs |
| Alpha 2 | Relationships |
| Alpha 3 | Quests |
| Alpha 4 | Goals |
| Alpha 5 | Threads |
| Alpha 6 | Psychology |
| Alpha 7 | Planning |
| Alpha 8 | Sociology |
| Alpha 9 | Grounding |

---

## Alpha 1: Beliefs

* Basic observation and constraint system (stolen hammer investigation)  
* NPCs can report what they've seen with temporal information  
* Multiple possibilities maintained until evidence narrows them down

## Alpha 2: Relationships

* Sentiments about other NPCs (trust/distrust, like/dislike)  
* These color how observations are interpreted and reported  
* Margrit's jealousy of Hanna affects how she describes events

## Alpha 3: Quests

* Story templates like "missing person" and "crime of passion"  
* Basic quest structure with investigation phases  
* Template-driven dialogue choices (ask about whereabouts, relationships)

## Alpha 4: Goals

* NPCs have objectives they pursue (Niellen: find Hanna, keep safe)  
* Goal conflicts create story tension  
* Player actions can support or oppose NPC goals

## Alpha 5: Threads

* Intelligent actor selection for story roles based on goals and relationships
* Template slot-filling that maximizes dramatic engagement
* Weaving multiple story elements into compelling combinations (Niellen's secret + Margrit's jealousy = perfect casting for love triangle)

## Alpha 6: Psychology

* Emotional states and personality traits affecting behavior
* Core dialogue gameplay - reading NPC moods, managing their emotional state
* Knowing how to calm, excite, or manipulate NPCs based on their psychology
* Fear, love, jealousy as drivers for meaningful conversation choices

## Alpha 7: Planning

* NPCs create multi-step schemes (Margrit's deception plan)  
* Counter-planning based on player actions  
* Facade creation and secret management

## Alpha 8: Sociology

* Group dynamics and faction relationships  
* Village social structures and reputation systems  
* How secrets and rumors spread through communities

## Alpha 9: Grounding

* Spatial world with locations and movement
* Time systems and scheduling
* Physical object interaction and environmental storytelling

---

## Versioning

Using milestone-based versioning:

- **Major version** = Alpha number (1-9)
- **Minor version**: `.0.x` = development milestones, `.1.x` = stable release + bug fixes
- **Patch version** = milestone/patch number

**Pattern:** `{Alpha}.{0=dev|1=stable}.{milestone/patch}`

**Examples:**
- `1.0.0` = Alpha 1 development started
- `1.0.1` = First milestone toward Alpha 1
- `1.1.0` = Alpha 1 stable release
- `1.1.1` = Alpha 1 bug fix
- `1.2.0` = Alpha 1 feature addition
- `2.0.0` = Alpha 2 development started
- `2.1.0` = Alpha 2 stable release

This allows maintaining stable Alpha 1 (`1.1.x`) while developing Alpha 2 (`2.0.x`).
