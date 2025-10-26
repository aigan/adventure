# Lazy Version Propagation Design (Revised)

## Overview

This design addresses the cascade problem when updating shared cultural beliefs across millions of NPCs in a branching timeline system. The core innovation is **lazy version propagation** with **shared intermediate materializations** - deferring node creation until query time, then reusing materialized paths.

## Core Concepts

### Belief Nodes
- Each node represents a belief with trait additions/subtractions
- Nodes inherit from previous versions or other prototypes
- Multiple inheritance supported for beliefs (not states)
- **Contains set of branched beliefs** as direct children

### States
- Collection of beliefs at a specific timestamp
- Single inheritance chain between state versions
- **Provides resolver logic** for branch evaluation
- Metadata includes probabilities and temporal coordinates

## Lazy Propagation Mechanism

### Branch Structure

```
BeliefNode {
  traits: TraitSet
  branches: Set<BeliefNode>  // branched versions
  resolved_for: Set<StateID>  // states that have evaluated branches
  origin_state: StateRef       // when this version was created
}
```

### Query Resolution Process

When querying an NPC's belief at time T110:

1. **Traversal**: Walk from leaf node up through inheritance chain
2. **Branch Detection**: Find nodes with non-empty branch sets
3. **Resolution**: State's resolver evaluates each branch:
   - Check branch metadata (origin_state timestamp)
   - Select appropriate version based on query context
4. **Chain Materialization**: 
   - First NPC creates full chain (NPC→City→Country)
   - Subsequent NPCs reuse existing intermediate nodes

### Materialization Reuse Pattern

First query (NPC1 at T110):
```
CountryBelief(v1) → [branches detected]
    ↓ detects
CountryBelief(v2)@T110
    ↓ creates
CityBelief(v2)@T110 → inherits from Country(v2)
    ↓ creates  
NPC1_knowledge(v2)@T110 → inherits from City(v2)
```

Second query (NPC2 at T110):

```
CityBelief(v2)@T110 → [already resolved, reuse]
    ↓ creates only
NPC2_knowledge(v2)@T110 → inherits from City(v2)
```

### Stability Tracking

**Resolved Home Nodes**: Set of nodes that have evaluated all branches and chosen to stay with current version
- Added when evaluation determines no change needed
- Cleared when new branch created on this node
- Allows skipping re-evaluation for stable paths

**Per-Node Resolution Cache**:
- `resolved_for`: Tracks which states have evaluated this node's branches
- Enables quick lookup to avoid redundant evaluations

## Branch Resolution Logic

The resolver (provided by querying state/belief) evaluates branches by:

1. **Temporal Check**: Compare query time with branch `origin_state` timestamp
2. **Context Evaluation**: Apply state-specific logic (spatial, social, probability)
3. **Selection**: Choose appropriate branches or stay with current

Key principle: Resolution logic lives in the **query context**, not the branches themselves.

## Scalability Through Shared Materialization

### Amortized Cost
- First query pays full materialization cost
- Subsequent queries reuse intermediate nodes
- City with 10,000 NPCs: One City version serves all

### Evaluation Optimization
When all inheritors have evaluated branches:
- Mark node as stable for current configuration
- Skip re-evaluation until new branches added
- Maintain "resolved home nodes" set for fast-path

### Cache Invalidation
New branch creation triggers:
- Clear "resolved home nodes" set
- Reset stability markers
- Force re-evaluation on next query

## Key Design Properties

### Incremental Materialization
- Create versions only when needed
- Reuse materialized intermediate nodes
- Build up shared structure over time

### State-Driven Resolution
- Resolver logic comes from querying state
- Branches are passive data
- Flexible resolution strategies per query

### Stability Optimization
- Track evaluated branches per node
- Mark stable configurations
- Fast-path for unchanged beliefs

## Database Considerations

- Cannot assume all nodes in memory
- Materialized chains persist for reuse
- Query patterns shape materialization structure
- Background process may consolidate/cleanup

==============

