## Task: Create Minimal Test Scenarios for Multi-Temporal Belief System

The goal is to create a progression of increasingly complex scenarios that test every aspect of the belief system, particularly its multi-temporal and multi-perspective capabilities. Each scenario should be minimal but precise enough to directly translate into code.

## Plan

### Testing Progression
1. **Single-mind beliefs** (baseline)
2. **Multi-mind conflicts** (perspective differences)
3. **Temporal reasoning** (past reconstruction)
4. **Hypothetical branching** (uncertainty handling)
5. **Theory of mind modeling** (nested beliefs)
6. **Planning/projection** (future scenarios)
7. **Belief revision** (reconciling conflicts)
8. **Complex chains** (combining all features)

### Comparison with GOAP
- **GOAP**: Works backward from goals, finding action chains in deterministic world state
- **This system**: Maintains multiple possible world states, reasons about subjective beliefs
- **Key difference**: GOAP assumes ground truth; this system has only perspectives

## Scenario Suite

### Scenario 1: Basic Observation
**Tests**: Belief creation, descriptors, observation mechanics
```yaml
Setup:
  world_mind has: apple_1 [red, shiny] at table
  player_mind: empty
  
Action: Player LOOK at table
  
Expected:
  player_mind creates: 
    - obs_1: {observer: player, target: apple_belief, time: tick_1}
    - apple_belief: {about: apple_1, descriptors: [red, shiny], location: table}
```

### Scenario 2: Partial Observation
**Tests**: Incomplete descriptor copying, belief uncertainty
```yaml
Setup:
  world_mind has: coin_1 [silver, worn, heads_up] at ground
  npc_1 walks by quickly
  
Action: npc_1 glimpses coin (partial observation)
  
Expected:
  npc1_mind creates:
    - coin_belief: {descriptors: [silver], location: ground}  # missed other details
    - certainty: uncertain about other properties
```

### Scenario 3: Object Disambiguation
**Tests**: Multiple similar objects, descriptor-based reasoning
```yaml
Setup:
  world_mind has: 
    - key_1 [brass, small] at drawer
    - key_2 [brass, large] at shelf  
    - key_3 [iron, small] at table
    
Action sequence:
  1. npc_1 observes key_1 (only notices [brass])
  2. npc_2 observes key_3 (notices [iron, small])
  3. Player asks npc_1 "where is brass key?"
  4. Player asks npc_2 "where is small key?"
  
Expected:
  - npc_1 can't distinguish key_1 from key_2
  - npc_2 gives specific location for key_3
  - System tracks ambiguity in npc_1's knowledge
```

### Scenario 4: Temporal Movement Tracking
**Tests**: Events over time, location changes, temporal queries
```yaml
Setup (tick_1):
  world_mind: book_1 at library
  
Events:
  tick_2: npc_1 observes book at library
  tick_3: npc_2 moves book to shop
  tick_4: npc_1 observes empty library
  tick_5: player asks npc_1 "where is book?"
  
Expected npc1_mind:
  States:
    state_t2: book at library (observed)
    state_t4: book NOT at library (observed absence)
    state_t5: book location unknown (must have moved between t2-t4)
  
  Reconstructed possibilities:
    - Someone took book between tick_2 and tick_4
    - Multiple hypothetical "who took it" branches
```

### Scenario 5: Theory of Mind - Basic
**Tests**: Modeling other minds, about relationships
```yaml
Setup:
  npc_1 steals gold_1 from chest at tick_1
  npc_2 was absent during theft
  
Action: npc_1 reasons about npc_2's beliefs
  
Expected npc1_mind:
  model_of_npc2_mind:
    - belief_gold_in_chest: {about: gold_1, location: chest}
    - no knowledge of theft event
    
Test: npc_1 can predict npc_2 will look in chest for gold
```

### Scenario 6: Theory of Mind - Deception Planning
**Tests**: Using belief models to plan deception
```yaml
Setup:
  npc_1 wants to frame npc_3 for stealing apple
  npc_2 is a witness
  
npc_1's planning:
  1. Model current beliefs:
     - npc2_mind: apple at tree
     - npc3_mind: apple at tree
  2. Generate goal state:
     - npc2_mind: believes npc_3 took apple
  3. Plan actions:
     - Move apple when npc_2 not looking
     - Ensure npc_2 sees npc_3 near tree
     - Create suspicious circumstances
     
Expected:
  Multiple plan branches based on predicted npc_2 reactions
```

### Scenario 7: Hypothetical Past Reconstruction
**Tests**: Backward temporal reasoning with multiple possibilities
```yaml
Current state (tick_10):
  - Vase is broken on floor
  - npc_1 was in room at tick_5
  - npc_2 was in room at tick_7
  - Cat was in room at tick_8
  
npc_3 enters at tick_10, sees broken vase
  
Expected npc3_mind branches:
  Branch A (likely): cat knocked it over at tick_8
    - Evidence: cat present, cats knock things over
  Branch B (possible): npc_2 broke it at tick_7
    - Evidence: human actor present
  Branch C (unlikely): npc_1 broke it at tick_5
    - Evidence: was present, but long ago
    
Each branch has different certainty weights
```

### Scenario 8: Conflicting Testimony Resolution
**Tests**: Reconciling contradictory beliefs from multiple sources
```yaml
Setup:
  hammer_1 missing from workshop
  
Testimonies to player:
  tick_1: npc_1 says "I saw npc_2 take hammer yesterday"
  tick_2: npc_2 says "I was at market all day yesterday"  
  tick_3: npc_3 says "I saw npc_2 at market yesterday"
  
Expected player_mind:
  Branches:
    A: npc_1 is lying (npc_2 and npc_3 testimonies align)
    B: npc_1 is mistaken (saw someone else)
    C: npc_2 was in both places (temporal resolution issue)
    
  Player can investigate to collapse branches
```

### Scenario 9: Nested Theory of Mind
**Tests**: Multi-level belief modeling (A thinks B thinks C knows)
```yaml
Setup:
  Secret: npc_1 and npc_2 are planning surprise party for npc_3
  npc_3 is suspicious
  
npc_1's belief model:
  Own mind:
    - Planning party for npc_3
  Model of npc_2:
    - Knows about party
    - Trying to keep secret
  Model of npc_3:
    - Doesn't know about party
    - But suspicious something is happening
  Model of npc_3's model of npc_1:
    - npc_3 thinks npc_1 is acting strange
    - npc_3 might think npc_1 is avoiding them
    
Test: npc_1 adjusts behavior based on nested model
```

### Scenario 10: Future Planning with Contingencies
**Tests**: Forward temporal projection, GOAP-style planning with beliefs
```yaml
Goal: npc_1 wants to buy sword from merchant
Problem: npc_1 has no gold
  
npc_1's planning:
  Path A: Ask npc_2 for loan
    - If npc_2's model includes "trusts npc_1": likely success
    - If not: need to build trust first
    - Contingency: offer collateral
    
  Path B: Sell items to merchant
    - Model merchant's interests
    - Predict acceptable items
    - Problem: might not have valuable enough items
    
  Path C: Find gold
    - Search known locations
    - Ask others about gold locations
    - Problem: time-consuming, uncertain
    
Expected:
  Multiple future state branches with probability weights
  Selection based on modeled reactions of others
```

### Scenario 11: Belief Revision Chain
**Tests**: Cascading belief updates when new evidence arrives
```yaml
Initial state:
  player_mind:
    - Believes npc_1 is guilty of theft
    - Believes npc_2 is accomplice
    - Believes stolen item hidden in warehouse
    
New evidence: Player finds item in npc_3's house
  
Expected cascade:
  1. Item location belief updated
  2. npc_3 becomes suspect
  3. Re-evaluate npc_1 guilt (maybe framed?)
  4. Re-evaluate npc_2 involvement
  5. Reconstruct new timeline possibilities
  6. Update all dependent plans/goals
```

### Scenario 12: Superposition Collapse Under Observation
**Tests**: Quantum-like state collapse, similar to wavefunction collapse
```yaml
Setup:
  Schrödinger's coin flip happened unseen at tick_1
  Multiple NPCs have different beliefs about result
  
States before observation:
  world_mind: 
    - Branch A (50%): coin is heads
    - Branch B (50%): coin is tails
  npc1_mind: believes heads (guessing)
  npc2_mind: believes tails (guessing)
  
Action: Player observes coin at tick_5
  
Expected:
  - Collapse to single state (e.g., heads)
  - npc1_mind beliefs now align with reality
  - npc2_mind beliefs marked as incorrect
  - All future branches must be consistent with observation
```

## Implementation Priority

1. **Start with**: Scenarios 1-4 (basic belief mechanics)
2. **Then add**: Scenarios 5-6 (simple theory of mind)
3. **Then add**: Scenarios 7-8 (temporal reasoning)
4. **Finally**: Scenarios 9-12 (complex interactions)

## Comparison with GOAP

| Aspect | GOAP | This System |
|--------|------|-------------|
| World State | Single, authoritative | Multiple perspectives |
| Planning | Backward from goal | Forward and backward |
| Uncertainty | Actions may fail | States exist in superposition |
| Other Agents | Fixed behavior models | Dynamic belief modeling |
| Time | Linear action sequences | Branching temporal possibilities |
| Knowledge | Perfect information | Partial observations |

The belief system essentially generalizes GOAP to handle subjective, multi-temporal reasoning where the "world state" itself is uncertain and perspective-dependent.
