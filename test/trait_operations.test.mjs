import { expect } from 'chai'
import { Mind, State, Belief, Archetype, Traittype } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import {log} from '../public/lib/debug.mjs'
import { stdTypes } from './helpers.mjs'

describe('Trait Operations Pattern', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

  it.skip('constructor marker creates mind via create_from_template', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: {_call: 'create_from_template'},  // Constructor marker
        },
      },
      Person: {
        bases: ['ObjectPhysical', 'Mental'],
      },
    }

    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    }

    DB.register(traittypes, archetypes, {})

    // Create world beliefs
    const world_mind = new Mind(null, 'world')
    const world_state = world_mind.create_state(1)

    const workshop = world_state.add_belief_from_template({
      label: 'workshop',
      bases: ['Location']
    })

    // Create NPC with Mental base - should construct mind via constructor marker
    const npc = world_state.add_belief_from_template({
      label: 'npc',
      bases: ['Person'],
      traits: {
        location: workshop.subject
      }
    })

    world_state.lock()

    const mind = npc.get_trait(world_state, 'mind')
    expect(mind).to.be.instanceOf(Mind)
    expect(mind.parent).to.equal(world_mind)

    const states = [...mind.states_at_tt(1)]
    expect(states).to.have.lengthOf(1)
    expect(states[0].locked).to.be.true  // Locked from world_state.lock

    // Should have empty belief set (no knowledge yet)
    const beliefs = [...states[0].get_beliefs()]
    expect(beliefs).to.have.lengthOf(0)
  })

  it.skip('single archetype with mind.append adds cultural knowledge', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: {_call: 'create_from_template'},
        },
      },
      Villager: {
        bases: ['Mental'],
        traits: {
          'mind.append': {
            tavern: ['location'],
          }
        },
      },
      Person: {
        bases: ['Villager'],
      },
    }

    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    }

    DB.register(traittypes, archetypes, {})

    // Create world beliefs
    const world_mind = new Mind(null, 'world')
    const world_state = world_mind.create_state(1)

    const world_tavern = world_state.add_belief_from_template({
      label: 'tavern',
      bases: ['Location']
    })

    // Create NPC with Villager base - should have knowledge about tavern
    const npc = world_state.add_belief_from_template({
      label: 'villager_npc',
      bases: ['Person']
    })

    world_state.lock()

    const mind = npc.get_trait(world_state, 'mind')
    expect(mind).to.be.instanceOf(Mind)

    // Get the mind's state
    const npc_state = [...mind.states_at_tt(1)][0]

    // Should have learned about world_tavern - find NPC's belief about it
    const npc_tavern = DB.get_belief_for_state_subject(npc_state, world_tavern.subject)
    expect(npc_tavern).to.exist

    // Should know tavern's location trait
    const knows_location = npc_tavern.can_have_trait('location')
    expect(knows_location).to.be.true
  })

  it.skip('multiple archetypes compose mind.append operations', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      PortableObject: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: {_call: 'create_from_template'},
        },
      },
      Villager: {
        bases: ['Mental'],
        traits: {
          'mind.append': {
            tavern: ['location'],
          }
        },
      },
      Blacksmith: {
        bases: ['Mental'],
        traits: {
          'mind.append': {
            forge: ['location'],
            tools: ['location'],
          }
        },
      },
      Person: {
        bases: ['Villager', 'Blacksmith'],
      },
    }

    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    }

    DB.register(traittypes, archetypes, {})

    // Create world beliefs
    const world_mind = new Mind(null, 'world')
    const world_state = world_mind.create_state(1)

    const world_tavern = world_state.add_belief_from_template({
      label: 'tavern',
      bases: ['Location']
    })

    const world_forge = world_state.add_belief_from_template({
      label: 'forge',
      bases: ['Location']
    })

    const world_tools = world_state.add_belief_from_template({
      label: 'tools',
      bases: ['PortableObject']
    })

    // Create NPC with both Villager and Blacksmith bases
    const npc = world_state.add_belief_from_template({
      label: 'blacksmith_villager',
      bases: ['Person']
    })

    // Get the mind trait BEFORE locking
    const mind = npc.get_trait(world_state, 'mind')

    world_state.lock()
    const npc_state = [...mind.states_at_tt(1)][0]

    // Should have knowledge from both Villager (tavern) and Blacksmith (forge, tools)
    const npc_tavern = DB.get_belief_for_state_subject(npc_state, world_tavern.subject)
    expect(npc_tavern).to.exist
    expect(npc_tavern.can_have_trait('location')).to.be.true

    const npc_forge = DB.get_belief_for_state_subject(npc_state, world_forge.subject)
    expect(npc_forge).to.exist
    expect(npc_forge.can_have_trait('location')).to.be.true

    const npc_tools = DB.get_belief_for_state_subject(npc_state, world_tools.subject)
    expect(npc_tools).to.exist
    expect(npc_tools.can_have_trait('location')).to.be.true
  })

  it.skip('mind.append with versioning adds knowledge to existing mind', () => {
    // Setup archetypes and traits
    const archetypes = {
      ObjectPhysical: {
        traits: {
          '@about': null,
          location: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      Mental: {
        traits: {
          mind: {_call: 'create_from_template'},
        },
      },
      Person: {
        bases: ['ObjectPhysical', 'Mental'],
      },
    }

    const traittypes = {
      ...stdTypes,
      location: 'Location',
      mind: 'Mind',
    }

    DB.register(traittypes, archetypes, {})

    // Create world beliefs
    const world_mind = new Mind(null, 'world')
    let world_state = world_mind.create_state(1)

    const world_tavern = world_state.add_belief_from_template({
      label: 'tavern',
      bases: ['Location']
    })

    const world_forge = world_state.add_belief_from_template({
      label: 'forge',
      bases: ['Location']
    })

    // Create NPC with empty mind initially
    let npc = world_state.add_belief_from_template({
      label: 'npc',
      bases: ['Person']
    })
    // FIXME: Make sure mind with initial state now exists in world_state
    
    // Initially, mind should be empty - get it BEFORE locking
    let mind = npc.get_trait(world_state, 'mind') // FIXME: REMOVE

    world_state.lock()
    let npc_state = [...mind.states_at_tt(1)][0]

    // Initially no beliefs about world entities
    let npc_tavern = DB.get_belief_for_state_subject(npc_state, world_tavern.subject)
    expect(npc_tavern).to.be.null

    // Tick to new state and add knowledge via mind.append operation
    world_state = world_state.tick_with_traits(npc, 2, {
      'mind.append': {
        tavern: ['location'],
        forge: ['location']
      }
    })
    // FIXME: make sure this results in a new mind state in world state.

    // Get the updated npc belief from the new state
    npc = world_state.get_belief_by_label('npc')

    // Now mind should have knowledge about tavern and forge
    mind = npc.get_trait(world_state, 'mind')
    npc_state = [...mind.states_at_tt(2)][0]

    npc_tavern = DB.get_belief_for_state_subject(npc_state, world_tavern.subject)
    expect(npc_tavern).to.exist

    const npc_forge = DB.get_belief_for_state_subject(npc_state, world_forge.subject)
    expect(npc_forge).to.exist
  })
})
