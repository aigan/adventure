/**
 * Perception - observation and identification of world entities
 *
 * Contains all perception-related functions that operate on State instances.
 * Functions take an explicit state parameter instead of using `this` context.
 *
 * Key concepts:
 * - Dual-process recognition: Fast path (certain identity) vs slow path (uncertain)
 * - Observable traits: Filtered by exposure modalities (visual, auditory, etc.)
 * - Constraint-based identification: Uses discriminating traits first
 * - Nested perception: Recursively perceives Subject-valued traits
 *
 * Import and call functions directly: `import { perceive } from './perception.mjs'`
 */

import { assert } from './debug.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'
import { Traittype, T } from './traittype.mjs'
import { Archetype, A } from './archetype.mjs'
import { Fuzzy } from './fuzzy.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Get observable traits from a belief based on exposure modalities
 * @param {State} state - State for resolution context
 * @param {Belief} belief - Belief to check
 * @param {string[]} modalities - Exposure modalities to observe
 * @returns {Traittype[]} Array of observable traittypes
 */
export function get_observable_traits(state, belief, modalities) {
  const observable_traits = []

  // Iterate through all traits on the belief
  // @heavy - filtering traits by exposure modality
  for (const [traittype, _value] of belief.get_traits()) {
    // Skip if traittype has no exposure metadata
    if (!traittype.exposure) {
      continue
    }

    // Skip internal traits (never physically observable)
    if (traittype.exposure === 'internal') {
      continue
    }

    // Include trait if its exposure matches any of the specified modalities
    if (modalities.includes(traittype.exposure)) {
      observable_traits.push(traittype)
    }
  }

  return observable_traits
}

/**
 * Perceive a single entity, creating a perceived belief with observable traits
 * @param {State} state - State instance for this perception
 * @private
 * @param {Belief} world_entity - Entity to perceive from the world state
 * @param {State} about_state - State to resolve trait values in
 * @param {string[]} modalities - Exposure modalities to observe
 * @returns {Belief} Perceived belief with observable traits
 */
export function _perceive_single(state, world_entity, about_state, modalities) {
  const observed_traittypes = get_observable_traits(state, world_entity, modalities)
  const archetype_bases = [...world_entity.get_archetypes()]

  /** @type {Record<string, any>} */
  const observed_traits = {}
  const uncertain_tt = T['@uncertain_identity']

  // FIXME: use traittype methods instead of if-else
  for (const traittype of observed_traittypes) {
    const value = world_entity.get_trait(about_state, traittype)
    // Skip null and Fuzzy (uncertain) values - only observe certain values
    if (value !== null && !(value instanceof Fuzzy)) {
      // If value is a Subject (nested entity), recursively perceive it
      if (value instanceof Subject) {
        const nested_belief = value.get_belief_by_state(about_state)
        if (nested_belief) {
          // Check if nested entity has uncertain identity
          const nested_is_uncertain = uncertain_tt && nested_belief.get_trait(about_state, uncertain_tt) === true

          if (nested_is_uncertain) {
            // Nested entity uncertain: use slow path
            const nested_perceived = _perceive_single(state, nested_belief, about_state, modalities)
            observed_traits[traittype.label] = nested_perceived.subject
          } else {
            // Nested entity certain (prototype): use fast path for reuse
            const result = _perceive_with_recognition(state, nested_belief, about_state, modalities)
            observed_traits[traittype.label] = result.belief.subject
          }
        }
      } else {
        // Handle Archetype objects from archetype templates - resolve to prototype Subject
        if (value instanceof Archetype) {
          // Try to find prototype with same label as archetype
          const subject = Subject.get_by_label(value.label)
          // Use null if no prototype exists (abstract archetype with no default instance)
          observed_traits[traittype.label] = subject ?? null
        } else {
          observed_traits[traittype.label] = value
        }
      }
    }
  }

  // Use Belief.from() since @about is not allowed in add_belief_from_template
  const perceived = Belief.from(state, archetype_bases, {
    '@about': null,
    ...observed_traits
  })

  return perceived
}

/**
 * Perceive entity with identity recognition (fast path)
 * Recursively perceives nested entities and creates versioned beliefs when traits change
 * @param {State} state - State instance for this perception
 * @private
 * @param {Belief} world_entity - Entity to perceive from world state
 * @param {State} world_state - State to resolve world entity traits in
 * @param {string[]} modalities - Observable modalities
 * @returns {{belief: Belief, all_perceived: Belief[]}} Knowledge belief and all perceived entities
 */
export function _perceive_with_recognition(state, world_entity, world_state, modalities) {
  // Collect all beliefs perceived during this operation (including nested)
  const all_perceived = []

  // Step 1: Recursively perceive all observable Subject-valued traits first
  const observed_traittypes = get_observable_traits(state, world_entity, modalities)
  /** @type {Record<string, any>} */
  const observed_traits = {}
  const uncertain_tt = T['@uncertain_identity']

  for (const traittype of observed_traittypes) {
    let value = world_entity.get_trait(world_state, traittype)

    // Skip null and Fuzzy (uncertain) values - only observe certain values
    if (value !== null && !(value instanceof Fuzzy)) {
      // If Subject-valued, recursively perceive it
      if (value instanceof Subject) {
        const nested_belief = value.get_belief_by_state(world_state)
        if (nested_belief) {
          const is_uncertain = uncertain_tt && nested_belief.get_trait(world_state, uncertain_tt) === true

          if (is_uncertain) {
            // Nested entity is uncertain: use slow path
            const perceived = _perceive_single(state, nested_belief, world_state, modalities)
            value = perceived.subject
            // NOTE: Don't add to all_perceived - parts are implicit, not content items
          } else {
            // Nested entity is certain: recursive fast path WITH pruning
            const nested_knowledge = recognize(state, nested_belief)

            if (nested_knowledge.length > 0) {
              const nested_memory = nested_knowledge[0]
              const world_vt = nested_belief.origin_state?.vt
              const memory_tt = nested_memory.origin_state?.tt

              // If memory is current, reuse it (prune tree walk for this nested entity)
              if (world_vt != null && memory_tt != null && world_vt <= memory_tt) {
                value = nested_memory.subject
                // NOTE: Don't add to all_perceived - parts are implicit
                observed_traits[traittype.label] = value
                continue  // Skip recursive call - memory is current
              }
            }

            // Memory stale or doesn't exist - recurse normally
            const result = _perceive_with_recognition(state, nested_belief, world_state, modalities)
            value = result.belief.subject
            // NOTE: Don't add nested parts to all_perceived - only top-level entities in content
          }
        }
      }

      observed_traits[traittype.label] = value
    }
  }

  // Step 2: Check for existing knowledge about this entity
  const existing_knowledge = recognize(state, world_entity)

  let main_belief

  if (existing_knowledge.length === 0) {
    // No existing knowledge: create new knowledge belief with @about set
    const archetype_bases = [...world_entity.get_archetypes()]
    main_belief = Belief.from(state, archetype_bases, {
      '@about': world_entity.subject,
      ...observed_traits
    })
  } else {
    // Step 3: Compare NON-SUBJECT traits with existing knowledge
    // (Subject traits don't matter - they auto-resolve to latest version in state)
    const knowledge = existing_knowledge[0]  // Use first match
    let traits_match = true

    for (const traittype of observed_traittypes) {
      const perceived_value = observed_traits[traittype.label]

      // Skip Subject-valued traits - they don't need comparison
      if (perceived_value instanceof Subject) continue

      const knowledge_value = knowledge.get_trait(state, traittype)

      if (perceived_value !== knowledge_value) {
        traits_match = false
        break
      }
    }

    // Step 4: Reuse or create versioned belief
    if (traits_match) {
      // All non-Subject traits match: reuse existing knowledge
      main_belief = knowledge
    } else {
      // Traits differ: create new version with knowledge as base
      // Only include non-Subject trait updates (Subject traits are inherited)
      /** @type {Record<string, any>} */
      const trait_updates = {}
      for (const [label, value] of Object.entries(observed_traits)) {
        if (!(value instanceof Subject)) {
          trait_updates[label] = value
        }
      }

      // Null out knowledge traits not in perception
      const knowledge_traits = knowledge.get_traits() // @heavy
      for (const [traittype, _value] of knowledge_traits) {
        if (traittype.label === '@about') continue  // Skip meta-trait
        if (!(traittype.label in observed_traits)) {
          trait_updates[traittype.label] = null
        }
      }

      // Use replace() to version belief - removes old, inserts new
      main_belief = knowledge.replace(state, trait_updates)
    }
  }

  all_perceived.push(main_belief)
  return {belief: main_belief, all_perceived}
}

/**
 * Create an observation/perception event capturing what was observed
 *
 * Implements the categorization phase of dual-process recognition:
 * - Fast path: Familiar entities → just store subject reference
 * - Slow path: Unfamiliar entities → create perceived belief with traits
 *
 * @param {State} state - State for perception context
 * @param {Belief[]} content - Array of world entities to perceive
 * @param {string[]} modalities - Exposure modalities to observe (default: ['visual'])
 * @returns {Belief} EventPerception belief containing perceived items
 */
export function perceive(state, content, modalities = ['visual']) {
  assert(!state.locked, 'Cannot modify locked state', {state_id: state._id, mind: state.in_mind.label})

  const all_perceived_subjects = []
  const uncertain_tt = T['@uncertain_identity']

  for (const world_entity of content) {
    const about_state = world_entity.origin_state

    const is_uncertain = uncertain_tt && world_entity.get_trait(about_state, uncertain_tt) === true

    if (is_uncertain) {
      // Slow path: Identity uncertain, create perceived belief with @about: null
      const perceived = _perceive_single(state, world_entity, about_state, modalities)
      all_perceived_subjects.push(perceived.subject)
    } else {
      // Fast path: Identity certain, use recognition-based perception
      const result = _perceive_with_recognition(state, world_entity, about_state, modalities)
      all_perceived_subjects.push(...result.all_perceived.map(b => b.subject))
    }
  }

  const perception = Belief.from(state, [A.EventPerception], {
    content: all_perceived_subjects
  })
  return perception
}

/**
 * Identify a perceived belief by matching traits against knowledge beliefs
 *
 * Uses constraint-based matching: filters by most discriminating traits first.
 * Strategy 1: Certain particular Subject traits (via rev_trait reverse index)
 * Strategy 2: Fallback to archetype scan with most specific archetype
 *
 * @param {State} state - State for identification context
 * @param {Belief} perceived_belief - Perceived belief with traits but no/unknown @about
 * @param {number} max_candidates - Maximum candidates to return (default 3)
 * @returns {Subject[]} Array of candidate subjects (up to max_candidates, ranked)
 */
export function identify(state, perceived_belief, max_candidates = 3) {
  const candidates = []
  const about_tt = Traittype.get_by_label('@about')

  // Extract perceived traits (excluding @about)
  const perceived_traits = []
  // @heavy - extracting traits for identification
  for (const [tt, v] of perceived_belief.get_traits()) {
    if (tt.label !== '@about') perceived_traits.push([tt, v])
  }

  if (perceived_traits.length === 0) {
    // No traits to match - fall back to archetype scan (rare case)
    return _identify_by_archetype(state, perceived_belief, max_candidates)
  }

  // Strategy 1: Use certain particular Subject traits (most discriminating)
  for (const [traittype, value] of perceived_traits) {
    if (value instanceof Subject && _is_certain_particular(state, value)) {
      // Get the belief for this subject in ground_state
      if (!state.ground_state) continue

      let value_belief = null
      try {
        value_belief = value.get_belief_by_state(state.ground_state)
      } catch (e) {
        continue  // Subject not found, skip
      }

      if (!value_belief) continue

      // Check if player has knowledge about this subject
      // If they do, we need to use their knowledge belief's subject for the lookup
      const player_knowledge = recognize(state, value_belief)
      const lookup_belief = player_knowledge.length > 0 ? player_knowledge[0] : value_belief

      // Highly selective: use rev_trait reverse index
      for (const candidate_belief of lookup_belief.rev_trait(state, traittype)) {
        // Verify it's knowledge (has @about)
        if (!about_tt) continue
        const about = candidate_belief.get_trait(state, about_tt)
        if (!about) continue

        // Verify all other perceived traits match
        if (_all_traits_match(state, perceived_belief, candidate_belief)) {
          candidates.push({subject: about, score: 1.0})

          // Direct match on certain particular = high confidence, stop
          if (candidates.length >= max_candidates) {
            return candidates.map(c => c.subject)
          }
        }
      }

      // If we found any via certain particular, return them
      if (candidates.length > 0) {
        return candidates.map(c => c.subject)
      }
    }
  }

  // Strategy 2: Scan by most specific archetype (fallback)
  // Use breadth-first iteration (recent beliefs first)
  const archetype = _get_most_specific_archetype(state, perceived_belief)
  if (!archetype) return []  // No archetypes

  // @heavy - scanning beliefs by archetype for identification
  for (const belief of state.get_beliefs_by_archetype(archetype)) {
    // Skip non-knowledge
    if (!about_tt) continue
    const about = belief.get_trait(state, about_tt)
    if (!about) continue

    // Match all perceived traits - require exact match (all traits must match)
    const score = match_traits(state, perceived_belief, belief)
    if (score === 1) {
      candidates.push({
        subject: about,
        score,
        belief_id: belief._id  // For temporal ordering within same state
      })

      // Stop at max candidates
      if (candidates.length >= max_candidates) {
        break
      }
    }
  }

  // Sort by score (descending), then by belief_id (newer beliefs have higher IDs)
  return candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score  // Primary: best matches first
      // Tiebreaker: newer beliefs first (breadth-first + temporal)
      assert(a.belief_id !== undefined, 'candidate a must have belief_id')
      assert(b.belief_id !== undefined, 'candidate b must have belief_id')
      return b.belief_id - a.belief_id
    })
    .map(c => c.subject)
}

/**
 * Check if Subject is a certain particular (not prototype, not uncertain)
 *
 * @param {State} state - State for resolution context
 * @private
 * @param {Subject} subject - Subject to check
 * @returns {boolean} True if certain particular instance
 */
export function _is_certain_particular(state, subject) {
  // Must be particular (not universal prototype)
  if (subject.mater === null) return false

  // Check in ground_state (world state) for the belief
  if (!state.ground_state) return false

  let belief = null
  try {
    belief = subject.get_belief_by_state(state.ground_state)
  } catch (e) {
    return false  // Subject not found in ground state
  }

  if (!belief) return false

  const uncertain_tt = Traittype.get_by_label('@uncertain_identity')
  if (!uncertain_tt) return true  // No uncertainty tracking = assume certain

  const is_uncertain = belief.get_trait(state.ground_state, uncertain_tt)
  return is_uncertain !== true  // Certain if not explicitly uncertain
}

/**
 * Verify all perceived traits match candidate belief
 *
 * @param {State} state - State for resolution context
 * @private
 * @param {Belief} perceived - Perceived belief with observed traits
 * @param {Belief} candidate - Knowledge belief to check
 * @returns {boolean} True if all traits match
 */
export function _all_traits_match(state, perceived, candidate) {
  const about_tt = Traittype.get_by_label('@about')

  // @heavy - comparing all traits for matching
  for (const [traittype, perceived_value] of perceived.get_traits()) {
    if (traittype.label === '@about') continue

    const candidate_value = candidate.get_trait(state, traittype)

    // Exact match check
    if (perceived_value instanceof Subject) {
      if (!(candidate_value instanceof Subject)) {
        return false
      }

      // Direct sid match
      if (perceived_value.sid === candidate_value.sid) {
        continue
      }

      // Check if candidate_value is player's knowledge about perceived_value
      // e.g., perceived has ground_state Subject(9), candidate has player knowledge Subject(19)
      // where Subject(19) has @about=Subject(9)
      if (about_tt && state.ground_state) {
        try {
          const candidate_belief = candidate_value.get_belief_by_state(state)
          const about = candidate_belief?.get_trait(state, about_tt)
          if (about && about.sid === perceived_value.sid) {
            continue
          }
        } catch (e) {
          // Subject not found in state
        }
      }

      return false
    } else if (perceived_value !== candidate_value) {
      return false
    }
  }
  return true
}

/**
 * Get most specific archetype from perceived belief
 *
 * @param {State} state - State for resolution context
 * @private
 * @param {Belief} belief
 * @returns {Archetype|null} Most specific archetype (first in bases)
 */
export function _get_most_specific_archetype(state, belief) {
  // Archetypes returned in breadth-first order: most specific first
  for (const archetype of belief.get_archetypes()) {
    return archetype
  }
  return null
}

/**
 * Identify by archetype scan (fallback when no traits available)
 *
 * @param {State} state - State for resolution context
 * @private
 * @param {Belief} perceived_belief
 * @param {number} max_candidates
 * @returns {Subject[]}
 */
export function _identify_by_archetype(state, perceived_belief, max_candidates) {
  const candidates = []
  const about_tt = Traittype.get_by_label('@about')
  if (!about_tt) return []

  const archetype = _get_most_specific_archetype(state, perceived_belief)
  if (!archetype) return []

  // @heavy - archetype-based identification fallback
  for (const belief of state.get_beliefs_by_archetype(archetype)) {
    const about = belief.get_trait(state, about_tt)
    if (!about) continue

    candidates.push(about)
    if (candidates.length >= max_candidates) break
  }

  return candidates
}

/**
 * Form knowledge from a perception event
 *
 * Processes EventPerception content, running identification for unrecognized items
 * and integrating them into knowledge via learn_about().
 *
 * @param {State} state - State for learning context
 * @param {Belief} perception - EventPerception belief
 */
export function learn_from(state, perception) {
  // FIXME: validate what learn_from does
  assert(!state.locked, 'Cannot modify locked state', {state_id: state._id, mind: state.in_mind.label})

  const content_tt = Traittype.get_by_label('content')
  const about_tt = Traittype.get_by_label('@about')
  if (!content_tt || !about_tt) return

  const content = perception.get_trait(state, content_tt)

  if (!content) return

  for (const item_subject of content) {
    const item = state.get_belief_by_subject(item_subject)
    if (!item) {
      // Subject not found in this state - skip
      continue
    }

    const about = item.get_trait(state, about_tt)

    if (about !== undefined) {
      // It's a perceived belief (has @about trait)
      if (about === null) {
        // Unidentified - run identification
        const candidates = identify(state, item)

        if (candidates.length === 1 && state.ground_state) {
          // Unambiguous match - learn about the identified entity
          const world_entity = candidates[0].get_belief_by_state(state.ground_state)
          learn_about(state, world_entity)
        }
        // else: Ambiguous or no match - skip for now
        // (Future: create uncertain knowledge, track ambiguity)
      } else if (state.ground_state) {
        // Already identified - learn about the identified entity
        const world_entity = /** @type {Subject} */ (about).get_belief_by_state(state.ground_state)
        learn_about(state, world_entity)
      }
    } else if (state.ground_state) {
      // Just a subject reference - familiar entity
      const world_entity = item_subject.get_belief_by_state(state.ground_state)
      learn_about(state, world_entity)
    }
  }
}

/**
 * Find existing knowledge beliefs about an entity
 *
 * @param {State} state - State to search in
 * @param {Belief} source_belief - Entity to find knowledge about
 * @returns {Belief[]} Array of knowledge beliefs with @about pointing to source entity
 */
export function recognize(state, source_belief) {
  // Find beliefs in this state where @about points to source_belief.subject
  // Uses reverse trait index for efficient lookup (only returns visible beliefs)
  const t_about = Traittype.get_by_label('@about')
  assert(t_about, "Traittype '@about' not found in registry")

  const query_state = state.ground_state ?? state.about_state
  // Try to get belief (may not exist if source_belief is not in query_state)
  let about_belief = null
  if (query_state) {
    try {
      about_belief = source_belief.subject.get_belief_by_state(query_state)
    } catch {
      // Belief doesn't exist in query_state - this is okay
    }
  }

  // TODO: Sort by confidence (for now just return first 3)
  // TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
  // TODO: Filter by acquaintance threshold - beliefs with low acquaintance
  //       may not trigger recognition during perception events
  const result = []
  if (about_belief) {
    for (const b of about_belief.rev_trait(state, t_about)) {
      result.push(b)
      if (result.length >= 3) break
    }
  }
  return result
}

/**
 * Learn about an entity from another state
 *
 * Creates or updates knowledge belief about a world entity, copying specified traits.
 * Prevents duplicate knowledge beliefs about the same entity.
 *
 * @param {State} state - Learning state (knowledge destination)
 * @param {Belief} source_belief - Entity to learn about (from world/parent state)
 * @param {Object} options - Learning options
 * @param {string[]} [options.traits] - Trait labels to copy (default: all observable)
 * @param {string[]} [options.modalities] - Exposure modalities to filter by
 * @returns {Belief} Knowledge belief (created or updated)
 */
export function learn_about(state, source_belief, options = {}) {
  assert(!state.locked, 'Cannot modify locked state', {state_id: state._id})

  const {traits, modalities} = options
  const source_state = source_belief.origin_state

  // Determine which traittypes to copy
  /** @type {Traittype[]} */
  let traittypes_to_copy
  if (traits) {
    // Explicit traits parameter overrides modalities
    traittypes_to_copy = /** @type {Traittype[]} */ (traits
      .map(label => Traittype.get_by_label(label))
      .filter((tt) => tt !== null))
  } else {
    // Use modalities (default: visual only)
    const effective_modalities = modalities || ['visual']
    traittypes_to_copy = get_observable_traits(state, source_belief, effective_modalities)
  }

  // Check for existing knowledge
  const existing_beliefs = recognize(state, source_belief)

  if (existing_beliefs.length > 0) {
    // Update first existing belief
    return integrate(state, source_state, source_belief, traittypes_to_copy, existing_beliefs)
  }

  // No existing knowledge - create new belief
  const archetype_bases = [...source_belief.get_archetypes()]
  /** @type {Record<string, any>} */
  const trait_values = {}

  for (const traittype of traittypes_to_copy) {
    if (!traittype) continue
    const value = source_belief.get_trait(source_state, traittype)
    // Skip null and Fuzzy (uncertain) values - only learn certain values
    if (value !== null && !(value instanceof Fuzzy)) {
      trait_values[traittype.label] = _recursively_learn_trait_value(state, source_state, value)
    }
  }

  const knowledge = Belief.from(state, archetype_bases, {
    '@about': source_belief.subject,
    ...trait_values
  })

  return knowledge
}

/**
 * Integrate new traits into existing knowledge belief
 *
 * @param {State} state - Learning state
 * @param {State} source_state - Source state for trait resolution
 * @param {Belief} source_belief - Source entity
 * @param {Traittype[]} traittypes - Traittypes to copy
 * @param {Belief[]} existing_beliefs - Existing knowledge beliefs
 * @returns {Belief} Updated knowledge belief
 */
export function integrate(state, source_state, source_belief, traittypes, existing_beliefs) {
  const existing = existing_beliefs[0]  // Use first existing belief
  /** @type {Record<string, any>} */
  const trait_updates = {}

  for (const traittype of traittypes) {
    if (!traittype) continue
    const value = source_belief.get_trait(source_state, traittype)
    // Skip null and Fuzzy (uncertain) values - only integrate certain values
    if (value !== null && !(value instanceof Fuzzy)) {
      trait_updates[traittype.label] = _recursively_learn_trait_value(state, source_state, value)
    }
  }

  // Check if any traits actually changed
  let has_changes = false
  for (const [label, new_value] of Object.entries(trait_updates)) {
    const tt = Traittype.get_by_label(label)
    if (!tt) continue
    const existing_value = existing.get_trait(state, tt)
    if (existing_value !== new_value) {
      has_changes = true
      break
    }
  }

  if (!has_changes) {
    return existing  // No changes, return existing belief
  }

  // Create new version with updates (removes old, inserts new)
  const updated = existing.replace(state, trait_updates)
  return updated
}

/**
 * Recursively dereference Subject-valued traits when learning
 *
 * @private
 * @param {State} state - Learning state
 * @param {State} source_state - Source state
 * @param {*} value - Trait value to process
 * @returns {*} Dereferenced value
 */
export function _recursively_learn_trait_value(state, source_state, value) {
  // Handle Subject references - recursively learn about them
  if (value instanceof Subject) {
    const nested_belief = value.get_belief_by_state(source_state)
    if (nested_belief) {
      const nested_knowledge = learn_about(state, nested_belief, {})
      return nested_knowledge.subject
    }
    return value
  }

  // Handle arrays of Subjects
  if (Array.isArray(value)) {
    return value.map(item => _recursively_learn_trait_value(state, source_state, item))
  }

  // Primitive values - copy as-is
  return value
}

/**
 * Match traits between two beliefs and return similarity score
 *
 * Initial simple implementation: exact match on all perceived traits = 1.0
 * Future: partial match, hierarchical matching, weighted traits
 *
 * @param {State} state - State for resolution context
 * @param {Belief} perceived - Perceived belief with observed traits
 * @param {Belief} knowledge - Knowledge belief to compare against
 * @returns {number} Match score (0.0 = no match, 1.0 = perfect match)
 */
export function match_traits(state, perceived, knowledge) {
  // FIXME: validate
  const perceived_traits = []
  // @heavy - extracting traits for scoring
  for (const [tt, v] of perceived.get_traits()) {
    if (tt.label !== '@about') perceived_traits.push([tt, v])
  }

  if (perceived_traits.length === 0) {
    // No traits to match (just archetype)
    return 0.5  // Weak match - same archetype but no discriminating traits
  }

  let matched_count = 0
  const total_count = perceived_traits.length

  for (const [traittype, perceived_value] of perceived_traits) {
    const knowledge_value = knowledge.get_trait(state, traittype)

    // Exact match check
    if (perceived_value === knowledge_value) {
      matched_count++
    } else if (perceived_value instanceof Subject) {
      // Subject reference - compare subject equality
      if (knowledge_value instanceof Subject && perceived_value.sid === knowledge_value.sid) {
        matched_count++
      }
    }
    // TODO: Nested object matching, array matching, partial matching
  }

  return matched_count / total_count
}
