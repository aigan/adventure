import { expect } from 'chai'
import { Mind, Materia, State, Temporal, Belief, Traittype, save_mind, load } from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupAfterEachValidation, setupStandardArchetypes } from './helpers.mjs'

describe('Temporal Reasoning', () => {
  beforeEach(() => {
    DB.reset_registries()
  })
  setupAfterEachValidation();


  // Helper to setup archetypes
  function setupArchetypes() {
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
      Person: {
        bases: ['ObjectPhysical'],
        traits: {
          mind: null,
        },
      },
    }

    const traittypes = {
      '@about': {
        type: 'Subject',
        mind: 'parent'
      },
      location: 'Location',
      mind: 'Mind',
    }

    DB.register(traittypes, archetypes, {})
  }

  describe('Fork Invariant (child.tt = parent_state.vt)', () => {
    it('child mind state inherits tt from ground_state.vt', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))
      expect(npc_mind).to.be.instanceOf(Mind)

      // Find the child mind's state
      const npc_states = [...npc_mind.states_at_tt(world_state, 100)]
      expect(npc_states).to.have.lengthOf(1)

      const npc_state = npc_states[0]

      // FORK INVARIANT: child.tt should equal parent_state.vt
      expect(npc_state.tt).to.equal(world_state.vt)
      expect(npc_state.tt).to.equal(100) // world_state.vt defaults to tt
    })

    it('Mind.create_from_template follows fork invariant', () => {
      // Was skipped due to "Cannot create state for locked self" error
      // Reactivated to test if issue has been resolved
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 200})

      world_state.add_belief_from_template({
        traits: {}, label: 'tavern',
        bases: ['Location']
      })

      // Create npc with mind trait - mind will be auto-created via template
      const npc = Belief.from_template(world_state, {
        bases: ['Person'],
        traits: {
          mind: { tavern: ['location'] }  // Mind template with learning spec
        },
        label: 'npc'
      })

      world_state.lock()

      // Get the npc's mind
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))
      expect(npc_mind).to.be.instanceOf(Mind)

      // Get the created mind state
      const npc_mind_state = npc_mind.origin_state
      expect(npc_mind_state).to.exist

      // Fork invariant: child state's tt = parent_state.vt
      expect(npc_mind_state.tt).to.equal(world_state.vt)
      expect(npc_mind_state.tt).to.equal(200)
    })

    it('get_or_create_open_state_for_ground follows fork invariant', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 150})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Lock initial mind state before locking world_state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state, world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // Call get_or_create_open_state_for_ground directly
      const npc_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc)

      // Fork invariant
      expect(npc_state.tt).to.equal(world_state.vt)
      expect(npc_state.tt).to.equal(150)
    })

    it('child state created at different parent vt has corresponding tt', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state1 = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state1.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state1, Traittype.get_by_label('mind'))

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state1, world_state1.vt)][0]
      initial_npc_state.lock()

      world_state1.lock()

      // Advance world to tt=200
      const world_state2 = world_state1.branch(world_state1.ground_state, 200)
      world_state2.lock()

      // Create child state at world_state2
      const npc_state2 = npc_mind.get_or_create_open_state_for_ground(world_state2, npc)

      // Fork invariant: child.tt = world_state2.vt
      expect(npc_state2.tt).to.equal(world_state2.vt)
      expect(npc_state2.tt).to.equal(200)
    })

    it('throws error when ground_state is in wrong mind', () => {
      setupArchetypes()

      const world_mind1 = new Materia(logos(), 'world1')
      const world_state1 = world_mind1.create_state(logos().origin_state, {tt: 100})

      const world_mind2 = new Materia(logos(), 'world2')
      const world_state2 = world_mind2.create_state(logos().origin_state, {tt: 100})

      const npc_mind = new Materia(world_mind1, 'npc')

      // Create a dummy belief for the test
      const npc_belief = Belief.from_template(world_state1, {
        bases: ['Person']
      })

      // Try to create state with ground_state from wrong parent
      expect(() => {
        npc_mind.get_or_create_open_state_for_ground(world_state2, npc_belief)
      }).to.throw(/ground_state must be in parent mind/)
    })
  })

  describe('Valid Time (VT) Basics', () => {
    it('vt defaults to tt when not specified', () => {
      const mind = new Materia(logos(), 'world')
      const state = mind.create_state(logos().origin_state, {tt: 100})

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(100) // Default
    })

    it('vt can be set explicitly via State constructor', () => {
      const mind = new Materia(logos(), 'world')
      const state = new Temporal(mind, logos().origin_state, null, {tt: 50, vt: 75})

      expect(state.tt).to.equal(50)
      expect(state.vt).to.equal(75)
    })

    it('vt can be set via branch()', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      // Create state at vt=150
      const state2 = state1.branch(state1.ground_state, 150)

      expect(state2.tt).to.equal(150) // For world mind with no ground_state, tt = vt
      expect(state2.vt).to.equal(150)
    })

    it('vt can differ from tt (past)', () => {
      const mind = new Materia(logos(), 'world')
      const state = new Temporal(mind, logos().origin_state, null, {tt: 100, vt: 50})

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(50)
      expect(state.vt).to.be.lessThan(state.tt)
    })

    it('vt can differ from tt (future)', () => {
      const mind = new Materia(logos(), 'world')
      const state = new Temporal(mind, logos().origin_state, null, {tt: 100, vt: 200})

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(200)
      expect(state.vt).to.be.greaterThan(state.tt)
    })

    it('vt can move freely while tt progresses forward', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = new Temporal(mind, logos().origin_state, null, {tt: 100, vt: 50})   // vt=50
      state1.lock()

      const state2 = new Temporal(mind, logos().origin_state, state1, {tt: 110, vt: 200}) // vt=200
      state2.lock()

      const state3 = new Temporal(mind, logos().origin_state, state2, {tt: 120, vt: 75})  // vt=75

      // TT progresses forward
      expect(state1.tt).to.equal(100)
      expect(state2.tt).to.equal(110)
      expect(state3.tt).to.equal(120)

      // VT moves freely
      expect(state1.vt).to.equal(50)
      expect(state2.vt).to.equal(200)
      expect(state3.vt).to.equal(75)
    })
  })

  describe('Memory Scenarios (vt < tt)', () => {
    it('NPC recalls what workshop looked like in the past', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      let world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      world_state.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state, world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // World advances to tt=200
      world_state = world_state.branch(world_state.ground_state, 200)
      world_state.lock()

      // Get NPC from new world_state
      const npc_at_200 = world_state.get_belief_by_subject(npc.subject)

      // NPC at tt=200 recalls the past at vt=100
      const memory_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc_at_200)

      // Override vt to think about the past
      memory_state.vt = 100

      expect(memory_state.tt).to.equal(200)  // Created now
      expect(memory_state.vt).to.equal(100)  // Thinking about past
      expect(memory_state.vt).to.be.lessThan(memory_state.tt)
    })

    it('NPC can have multiple memories at different vt', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 300})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Create memory states at different vt (using unlocked belief to avoid self lock error)
      const memory1 = new Temporal(npc_mind, world_state, null, {vt: 100})
      const memory2 = new Temporal(npc_mind, world_state, null, {vt: 150})
      const memory3 = new Temporal(npc_mind, world_state, null, {vt: 200})

      // All created at same tt, thinking about different past moments
      expect(memory1.tt).to.equal(300)
      expect(memory2.tt).to.equal(300)
      expect(memory3.tt).to.equal(300)

      expect(memory1.vt).to.equal(100)
      expect(memory2.vt).to.equal(150)
      expect(memory3.vt).to.equal(200)
    })
  })

  describe('Planning Scenarios (vt > tt)', () => {
    it('NPC plans future action', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state, world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // This creates or reuses the NPC's state
      const npc_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc)

      // NPC at tt=100 plans for future at vt=200
      npc_state.vt = 200

      expect(npc_state.tt).to.equal(100)  // Created now
      expect(npc_state.vt).to.equal(200)  // Thinking about future
      expect(npc_state.vt).to.be.greaterThan(npc_state.tt)
    })

    it('NPC can have multiple plans at different future vt', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Create plan states for different futures (using unlocked belief to avoid self lock error)
      const plan1 = new Temporal(npc_mind, world_state, null, {vt: 150})
      const plan2 = new Temporal(npc_mind, world_state, null, {vt: 200})
      const plan3 = new Temporal(npc_mind, world_state, null, {vt: 300})

      // All created at same tt, planning different futures
      expect(plan1.tt).to.equal(100)
      expect(plan2.tt).to.equal(100)
      expect(plan3.tt).to.equal(100)

      expect(plan1.vt).to.equal(150)
      expect(plan2.vt).to.equal(200)
      expect(plan3.vt).to.equal(300)
    })
  })

  describe('Ground State Time Coordination', () => {
    it('child state synchronizes with advancing parent', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      let world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state, world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // Advance world to tt=200
      world_state = world_state.branch(world_state.ground_state, 200)
      world_state.lock()

      // Get NPC from new world_state
      const npc_at_200 = world_state.get_belief_by_subject(npc.subject)

      // Create child state - should sync to world_state.vt
      const npc_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc_at_200)

      expect(npc_state.tt).to.equal(200)  // Synced to ground_state.vt
      expect(npc_state.ground_state).to.equal(world_state)
    })

    it('nested mind chain maintains coordination (3 levels)', () => {
      setupArchetypes()

      // World → NPC → NPC's model of other NPC
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc1 = world_state.add_belief_from_template({
        label: 'npc1',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC1's mind (auto-created from trait spec)
      const npc1_mind = npc1.get_trait(world_state, Traittype.get_by_label('mind'))

      // Get or create unlocked state for npc1
      const npc1_state = npc1_mind.get_or_create_open_state_for_ground(world_state, npc1)

      // NPC1 models NPC2 (before locking world_state)
      const npc2_model = npc1_state.add_belief_from_template({
        label: 'npc2_model',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      // Get NPC2's mind (auto-created from trait spec)
      const npc2_model_mind = npc2_model.get_trait(npc1_state, Traittype.get_by_label('mind'))
      const npc2_model_state = [...npc2_model_mind.states_at_tt(npc1_state, 100)][0]

      world_state.lock()
      npc1_state.lock()
      npc2_model_state.lock()

      // Verify 3-level coordination
      expect(world_state.tt).to.equal(100)
      expect(npc1_state.tt).to.equal(100)  // child.tt = world_state.vt
      expect(npc2_model_state.tt).to.equal(100)  // grandchild.tt = npc1_state.vt

      expect(npc1_state.ground_state).to.equal(world_state)
      expect(npc2_model_state.ground_state).to.equal(npc1_state)
    })

    it('branch() with explicit vt overrides ground_state.vt', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))
      const npc_state1 = [...npc_mind.states_at_tt(world_state, 100)][0]
      npc_state1.lock()

      // Branch with explicit vt=50 (thinking about past)
      const npc_state2 = npc_state1.branch(world_state, 50)

      // tt from ground_state.vt, vt from explicit parameter
      expect(npc_state2.tt).to.equal(100)  // ground_state.vt
      expect(npc_state2.vt).to.equal(50)   // Explicit override
    })
  })

  describe('Superposition (same tt, different possibilities)', () => {
    it('multiple states at same tt with same ground_state', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Create multiple states at same tt (different possibilities)
      // Use null self to avoid locked belief error
      const possibility_a = new Temporal(npc_mind, world_state, null, {vt: 100})
      const possibility_b = new Temporal(npc_mind, world_state, null, {vt: 100})

      // Both at same tt, same ground_state, same vt
      expect(possibility_a.tt).to.equal(100)
      expect(possibility_b.tt).to.equal(100)
      expect(possibility_a.ground_state).to.equal(world_state)
      expect(possibility_b.ground_state).to.equal(world_state)

      // states_at_tt should return both
      const states = [...npc_mind.states_at_tt(world_state, 100)]
      expect(states).to.include(possibility_a)
      expect(states).to.include(possibility_b)
      expect(states.length).to.be.at.least(2)
    })

    it('different beliefs in each superposed state', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const hammer = world_state.add_belief_from_template({
        label: 'hammer',
        bases: ['PortableObject']
      })

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind with empty learning spec
        }
      })

      world_state.lock()

      // Get NPC's mind (auto-created from trait spec)
      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))

      // Possibility A: NPC believes hammer is in workshop
      const poss_a = new Temporal(npc_mind, world_state, null, {vt: 100})
      const workshop_a = poss_a.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })
      poss_a.add_belief_from_template({
        label: 'hammer_belief_a',
        bases: ['PortableObject'],
        traits: {
          '@about': hammer.subject,
          location: workshop_a.subject
        }
      })

      // Possibility B: NPC believes hammer is in shed
      const poss_b = new Temporal(npc_mind, world_state, null, {vt: 100})
      const shed_b = poss_b.add_belief_from_template({
        label: 'shed',
        bases: ['Location']
      })
      poss_b.add_belief_from_template({
        label: 'hammer_belief_b',
        bases: ['PortableObject'],
        traits: {
          '@about': hammer.subject,
          location: shed_b.subject
        }
      })

      // Both states exist at tt=100 with different beliefs
      expect(poss_a.tt).to.equal(poss_b.tt)
      expect([...poss_a.get_beliefs()].length).to.equal(2)
      expect([...poss_b.get_beliefs()].length).to.equal(2)
    })

    it('same tt + different ground_state = versioning, not superposition', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state1 = world_mind.create_state(logos().origin_state, {tt: 100})
      world_state1.lock()

      const world_state2 = world_state1.branch(world_state1.ground_state, 200)
      world_state2.lock()

      const npc_mind = new Materia(world_mind, 'npc')

      // Same vt=100, but different ground_states
      const state_a = new Temporal(npc_mind, world_state1, null, {vt: 100})
      const state_b = new Temporal(npc_mind, world_state2, null, {vt: 100})

      // Different ground_states means versioning in parent timeline
      // tt comes from ground_state.vt (fork invariant), so different ground_states → different tt
      expect(state_a.ground_state).to.not.equal(state_b.ground_state)
      expect(state_a.ground_state.tt).to.equal(100)
      expect(state_b.ground_state.tt).to.equal(200)
      expect(state_a.tt).to.equal(100)  // From world_state1.vt
      expect(state_b.tt).to.equal(200)  // From world_state2.vt
    })
  })

  describe('Transaction Time (TT) Basics', () => {
    it('tt is always set on state creation', () => {
      const mind = new Materia(logos(), 'world')
      const state = mind.create_state(logos().origin_state, {tt: 42})

      expect(state.tt).to.be.a('number')
      expect(state.tt).to.equal(42)
    })

    it('tt progresses forward in state chain', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      const state2 = state1.branch(state1.ground_state, 200)
      state2.lock()

      const state3 = state2.branch(state2.ground_state, 300)

      expect(state1.tt).to.equal(100)
      expect(state2.tt).to.equal(200)
      expect(state3.tt).to.equal(300)
      expect(state2.tt).to.be.greaterThan(state1.tt)
      expect(state3.tt).to.be.greaterThan(state2.tt)
    })

    it('tt cannot go backwards', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 200})
      state1.lock()

      // Try to create state with lower tt
      expect(() => {
        state1.branch(state1.ground_state, 100)  // 100 < 200 violates constraint
      }).to.throw('tt must not go backwards')
    })

    it('states_at_tt returns correct states', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      const state2 = state1.branch(state1.ground_state, 200)
      state2.lock()

      const state3 = state2.branch(state2.ground_state, 300)
      state3.lock()

      // Query at different tt values
      const ground = logos().origin_state
      expect([...mind.states_at_tt(ground, 50)]).to.deep.equal([])
      expect([...mind.states_at_tt(ground, 100)]).to.deep.equal([state1])
      expect([...mind.states_at_tt(ground, 150)]).to.deep.equal([state1])
      expect([...mind.states_at_tt(ground, 200)]).to.deep.equal([state2])
      expect([...mind.states_at_tt(ground, 999)]).to.deep.equal([state3])
    })

    it('states_at_tt filters by ground_state', () => {
      // states_at_tt(ground_state, tt) only returns states for the specified ground_state
      // This ensures you get states relevant to a specific parent context
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')

      // Create two parallel world branches at tt=100
      const world_state_a = world_mind.create_state(logos().origin_state, {tt: 100})
      const npc_a = world_state_a.add_belief_from_template({
        label: 'npc_a',
        bases: ['Person'],
        traits: { mind: {} }
      })
      const npc_mind = npc_a.get_trait(world_state_a, Traittype.get_by_label('mind'))
      const npc_state_for_a = [...npc_mind.states_at_tt(world_state_a, 100)][0]
      npc_state_for_a.lock()
      world_state_a.lock()

      // Second branch - create parallel world state (sibling, not child)
      const world_state_b = world_mind.create_state(logos().origin_state, {tt: 100})
      const npc_b = world_state_b.add_belief_from_template({
        label: 'npc_b',
        bases: ['Person'],
        traits: { mind: npc_mind }  // Reuse the same mind
      })
      // Create independent state for this ground_state
      const npc_state_for_b = npc_mind.get_or_create_open_state_for_ground(world_state_b, npc_b)
      npc_state_for_b.lock()
      world_state_b.lock()

      // Both states have tt=100
      expect(npc_state_for_a.tt).to.equal(100)
      expect(npc_state_for_b.tt).to.equal(100)

      // Verify they have different ground_states
      expect(npc_state_for_a.ground_state).to.equal(world_state_a)
      expect(npc_state_for_b.ground_state).to.equal(world_state_b)

      // states_at_tt(ground_state, tt) now filters by ground_state
      const states_a = [...npc_mind.states_at_tt(world_state_a, 100)]
      expect(states_a).to.have.lengthOf(1)
      expect(states_a).to.include(npc_state_for_a)

      const states_b = [...npc_mind.states_at_tt(world_state_b, 100)]
      expect(states_b).to.have.lengthOf(1)
      expect(states_b).to.include(npc_state_for_b)
    })
  })

  describe('Error Conditions & Edge Cases', () => {
    it('ground_state must be in parent mind', () => {
      setupArchetypes()

      const world_mind1 = new Materia(logos(), 'world1')
      const world_state1 = world_mind1.create_state(logos().origin_state, {tt: 100})

      const world_mind2 = new Materia(logos(), 'world2')
      const world_state2 = world_mind2.create_state(logos().origin_state, {tt: 100})

      const npc_mind = new Materia(world_mind1, 'npc')

      // Create a dummy belief for the test
      const npc_belief = Belief.from_template(world_state1, {
        bases: ['Person']
      })

      // Try to use ground_state from wrong parent
      expect(() => {
        npc_mind.get_or_create_open_state_for_ground(world_state2, npc_belief)
      }).to.throw(/ground_state must be in parent mind/)
    })

    it('world mind branch with explicit vt', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      // World mind branch with explicit vt
      const state2 = state1.branch(state1.ground_state, 200)

      expect(state2.tt).to.equal(200)
      expect(state2.vt).to.equal(200)
    })

    it('branch requires vt parameter', () => {
      const mind = new Materia(logos(), 'world')
      const state1 = mind.create_state(logos().origin_state, {tt: 100})
      state1.lock()

      // Calling branch with null vt should fail
      expect(() => {
        state1.branch(logos().origin_state, null)
      }).to.throw(/vt must be provided/)
    })
  })

  describe('save/load round-trip', () => {
    it('preserves tt and vt after save/load', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      world_state.add_belief_from_template({
        bases: ['Location'],
        traits: {},
        label: 'tavern'
      })

      world_state.lock()

      // Create state at different tt
      const world_state2 = world_state.branch(world_state.ground_state, 200)
      world_state2.lock()

      // Verify tt before save
      expect(world_state.tt).to.equal(100)
      expect(world_state2.tt).to.equal(200)

      // Save and reload
      const json = save_mind(world_mind)
      DB.reset_registries()
      setupArchetypes()
      const loaded_world = load(json)

      // Find states by tt
      const states = [...loaded_world._states].sort((a, b) => a.tt - b.tt)
      expect(states).to.have.lengthOf(2)
      expect(states[0].tt).to.equal(100)
      expect(states[0].vt).to.equal(100)
      expect(states[1].tt).to.equal(200)
      expect(states[1].vt).to.equal(200)
    })

    it('states_at_tt works correctly after save/load', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state1 = world_mind.create_state(logos().origin_state, {tt: 100})
      world_state1.lock()

      const world_state2 = world_state1.branch(world_state1.ground_state, 200)
      world_state2.lock()

      const world_state3 = world_state2.branch(world_state2.ground_state, 300)
      world_state3.lock()

      // Save and reload
      const json = save_mind(world_mind)
      DB.reset_registries()
      setupArchetypes()
      const loaded_world = load(json)

      // Verify states_at_tt works correctly
      const ground = logos().origin_state
      expect([...loaded_world.states_at_tt(ground, 50)]).to.deep.equal([])

      const states_at_100 = [...loaded_world.states_at_tt(ground, 100)]
      expect(states_at_100).to.have.lengthOf(1)
      expect(states_at_100[0].tt).to.equal(100)

      const states_at_200 = [...loaded_world.states_at_tt(ground, 200)]
      expect(states_at_200).to.have.lengthOf(1)
      expect(states_at_200[0].tt).to.equal(200)

      const states_at_999 = [...loaded_world.states_at_tt(ground, 999)]
      expect(states_at_999).to.have.lengthOf(1)
      expect(states_at_999[0].tt).to.equal(300)
    })

    it('child mind preserves temporal coordination after save/load', () => {
      setupArchetypes()

      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person'],
        traits: {
          mind: {}  // Auto-create mind
        }
      })

      const npc_mind = npc.get_trait(world_state, Traittype.get_by_label('mind'))
      const initial_npc_state = [...npc_mind.states_at_tt(world_state, 100)][0]
      initial_npc_state.lock()
      world_state.lock()

      // Verify fork invariant before save
      expect(initial_npc_state.tt).to.equal(world_state.vt)

      // Save world and reload
      const json = save_mind(world_mind)
      DB.reset_registries()
      setupArchetypes()
      const loaded_world = load(json)

      // Find loaded state
      const loaded_world_state = [...loaded_world._states][0]
      expect(loaded_world_state.tt).to.equal(100)

      // Verify child mind coordination
      const loaded_npc = loaded_world_state.get_belief_by_label('npc')
      const loaded_npc_mind = loaded_npc.get_trait(loaded_world_state, Traittype.get_by_label('mind'))

      // Find child state and verify fork invariant preserved
      const loaded_npc_states = [...loaded_npc_mind.states_at_tt(loaded_world_state, 100)]
      expect(loaded_npc_states).to.have.lengthOf(1)
      expect(loaded_npc_states[0].tt).to.equal(loaded_world_state.vt)
    })
  })
})
