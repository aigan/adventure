import { expect } from 'chai'
import { Mind, State, Belief , logos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'


describe.skip('Temporal Reasoning', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

  // Helper to setup archetypes with mind constructor
  function setupArchetypesWithMind() {
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
          mind: {_call: 'create_from_template'},  // Constructor marker
        },
      },
      Person: {
        bases: ['ObjectPhysical', 'Mental'],
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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking (created by Mental archetype)
      const npc_mind = npc.get_trait(world_state, 'mind')
      expect(npc_mind).to.be.instanceOf(Mind)

      world_state.lock()

      // Find the child mind's state
      const npc_states = [...npc_mind.states_at_tt(100)]
      expect(npc_states).to.have.lengthOf(1)

      const npc_state = npc_states[0]

      // FORK INVARIANT: child.tt should equal parent_state.vt
      expect(npc_state.tt).to.equal(world_state.vt)
      expect(npc_state.tt).to.equal(100) // world_state.vt defaults to tt
    })

    it('Mind.create_from_template follows fork invariant', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(200, null)

      world_state.add_belief_from_template({
        label: 'tavern',
        bases: ['Location']
      })

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      const learn_spec = { tavern: ['location'] }
      const npc_mind_state = Mind.create_from_template(world_state, npc, learn_spec)

      // Fork invariant: child state's tt = parent_state.vt
      expect(npc_mind_state.tt).to.equal(world_state.vt)
      expect(npc_mind_state.tt).to.equal(200)
    })

    it('get_or_create_open_state_for_ground follows fork invariant', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(150, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      // Lock initial mind state before locking world_state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // Call get_or_create_open_state_for_ground directly
      const npc_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc)

      // Fork invariant
      expect(npc_state.tt).to.equal(world_state.vt)
      expect(npc_state.tt).to.equal(150)
    })

    it('child state created at different parent vt has corresponding tt', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state1 = world_mind.create_state(100, null)

      const npc = world_state1.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state1, 'mind')

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state1.vt)][0]
      initial_npc_state.lock()

      world_state1.lock()

      // Advance world to tt=200
      const world_state2 = world_state1.tick(null, 200)
      world_state2.lock()

      // Create child state at world_state2
      const npc_state2 = npc_mind.get_or_create_open_state_for_ground(world_state2, npc)

      // Fork invariant: child.tt = world_state2.vt
      expect(npc_state2.tt).to.equal(world_state2.vt)
      expect(npc_state2.tt).to.equal(200)
    })

    it('throws error when ground_state is in wrong mind', () => {
      setupArchetypesWithMind()

      const world_mind1 = new Mind(logos(), 'world1')
      const world_state1 = world_mind1.create_state(100, null)

      const world_mind2 = new Mind(logos(), 'world2')
      const world_state2 = world_mind2.create_state(100, null)

      const npc_mind = new Mind(world_mind1, 'npc')

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
      const mind = new Mind(logos(), 'world')
      const state = mind.create_state(100, null)

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(100) // Default
    })

    it('vt can be set explicitly via State constructor', () => {
      const mind = new Mind(logos(), 'world')
      const state = new State(mind, 50, null, logos().origin_state, null, 75)

      expect(state.tt).to.equal(50)
      expect(state.vt).to.equal(75)
    })

    it('vt can be set via tick()', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(100, null)
      state1.lock()

      // Create state at tt=200 thinking about vt=150
      const state2 = state1.tick(null, 150)

      expect(state2.tt).to.equal(150) // For world mind with no ground_state, tt = vt
      expect(state2.vt).to.equal(150)
    })

    it('vt can differ from tt (past)', () => {
      const mind = new Mind(logos(), 'world')
      const state = new State(mind, 100, null, logos().origin_state, null, 50)

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(50)
      expect(state.vt).to.be.lessThan(state.tt)
    })

    it('vt can differ from tt (future)', () => {
      const mind = new Mind(logos(), 'world')
      const state = new State(mind, 100, null, logos().origin_state, null, 200)

      expect(state.tt).to.equal(100)
      expect(state.vt).to.equal(200)
      expect(state.vt).to.be.greaterThan(state.tt)
    })

    it('vt can move freely while tt progresses forward', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = new State(mind, 100, null, logos().origin_state, null, 50)   // vt=50
      state1.lock()

      const state2 = new State(mind, 110, state1, logos().origin_state, null, 200) // vt=200
      state2.lock()

      const state3 = new State(mind, 120, state2, logos().origin_state, null, 75)  // vt=75

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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      let world_state = world_mind.create_state(100, null)

      world_state.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // World advances to tt=200
      world_state = world_state.tick(null, 200)
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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(300, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      world_state.lock()

      // Create memory states at different vt (using unlocked belief to avoid self lock error)
      const memory1 = new State(npc_mind, 300, null, world_state, null, 100)
      const memory2 = new State(npc_mind, 300, null, world_state, null, 150)
      const memory3 = new State(npc_mind, 300, null, world_state, null, 200)

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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state.vt)][0]
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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      world_state.lock()

      // Create plan states for different futures (using unlocked belief to avoid self lock error)
      const plan1 = new State(npc_mind, 100, null, world_state, null, 150)
      const plan2 = new State(npc_mind, 100, null, world_state, null, 200)
      const plan3 = new State(npc_mind, 100, null, world_state, null, 300)

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
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      let world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // Advance world to tt=200
      world_state = world_state.tick(null, 200)
      world_state.lock()

      // Get NPC from new world_state
      const npc_at_200 = world_state.get_belief_by_subject(npc.subject)

      // Create child state - should sync to world_state.vt
      const npc_state = npc_mind.get_or_create_open_state_for_ground(world_state, npc_at_200)

      expect(npc_state.tt).to.equal(200)  // Synced to ground_state.vt
      expect(npc_state.ground_state).to.equal(world_state)
    })

    it('nested mind chain maintains coordination (3 levels)', () => {
      setupArchetypesWithMind()

      // World → NPC → NPC's model of other NPC
      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc1 = world_state.add_belief_from_template({
        label: 'npc1',
        bases: ['Person']
      })

      // Get NPC1's mind BEFORE locking
      const npc1_mind = npc1.get_trait(world_state, 'mind')

      world_state.lock()

      const npc1_state = [...npc1_mind.states_at_tt(100)][0]

      // NPC1 models NPC2
      const npc2_model = npc1_state.add_belief_from_template({
        label: 'npc2_model',
        bases: ['Person']
      })

      // Get NPC2's mind BEFORE locking
      const npc2_model_mind = npc2_model.get_trait(npc1_state, 'mind')

      npc1_state.lock()
      const npc2_model_state = [...npc2_model_mind.states_at_tt(100)][0]

      // Verify 3-level coordination
      expect(world_state.tt).to.equal(100)
      expect(npc1_state.tt).to.equal(100)  // child.tt = world_state.vt
      expect(npc2_model_state.tt).to.equal(100)  // grandchild.tt = npc1_state.vt

      expect(npc1_state.ground_state).to.equal(world_state)
      expect(npc2_model_state.ground_state).to.equal(npc1_state)
    })

    it('tick() with explicit vt overrides ground_state.vt', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      world_state.lock()
      const npc_state1 = [...npc_mind.states_at_tt(100)][0]
      npc_state1.lock()

      // Tick with explicit vt=50 (thinking about past)
      const npc_state2 = npc_state1.tick(world_state, 50)

      // tt from ground_state.vt, vt from explicit parameter
      expect(npc_state2.tt).to.equal(100)  // ground_state.vt
      expect(npc_state2.vt).to.equal(50)   // Explicit override
    })
  })

  describe('Superposition (same tt, different possibilities)', () => {
    it('multiple states at same tt with same ground_state', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      world_state.lock()

      // Create multiple states at same tt (different possibilities)
      // Use null self to avoid locked belief error
      const possibility_a = new State(npc_mind, 100, null, world_state, null, 100)
      const possibility_b = new State(npc_mind, 100, null, world_state, null, 100)

      // Both at same tt, same ground_state, same vt
      expect(possibility_a.tt).to.equal(100)
      expect(possibility_b.tt).to.equal(100)
      expect(possibility_a.ground_state).to.equal(world_state)
      expect(possibility_b.ground_state).to.equal(world_state)

      // states_at_tt should return both
      const states = [...npc_mind.states_at_tt(100)]
      expect(states).to.include(possibility_a)
      expect(states).to.include(possibility_b)
      expect(states.length).to.be.at.least(2)
    })

    it('different beliefs in each superposed state', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const hammer = world_state.add_belief_from_template({
        label: 'hammer',
        bases: ['PortableObject']
      })

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      world_state.lock()

      // Possibility A: NPC believes hammer is in workshop
      const poss_a = new State(npc_mind, 100, null, world_state, null, 100)
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
      const poss_b = new State(npc_mind, 100, null, world_state, null, 100)
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
      const world_mind = new Mind(logos(), 'world')
      const world_state1 = world_mind.create_state(100, null)
      world_state1.lock()

      const world_state2 = world_state1.tick(null, 200)
      world_state2.lock()

      const npc_mind = new Mind(world_mind, 'npc')

      // Same tt=100, but different ground_states
      const state_a = new State(npc_mind, 100, null, world_state1, null, 100)
      const state_b = new State(npc_mind, 100, null, world_state2, null, 100)

      // Different ground_states means versioning in parent timeline
      expect(state_a.tt).to.equal(state_b.tt)
      expect(state_a.ground_state).to.not.equal(state_b.ground_state)
      expect(state_a.ground_state.tt).to.equal(100)
      expect(state_b.ground_state.tt).to.equal(200)
    })
  })

  describe('Transaction Time (TT) Basics', () => {
    it('tt is always set on state creation', () => {
      const mind = new Mind(logos(), 'world')
      const state = mind.create_state(42, null)

      expect(state.tt).to.be.a('number')
      expect(state.tt).to.equal(42)
    })

    it('tt progresses forward in state chain', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(100, null)
      state1.lock()

      const state2 = state1.tick(null, 200)
      state2.lock()

      const state3 = state2.tick(null, 300)

      expect(state1.tt).to.equal(100)
      expect(state2.tt).to.equal(200)
      expect(state3.tt).to.equal(300)
      expect(state2.tt).to.be.greaterThan(state1.tt)
      expect(state3.tt).to.be.greaterThan(state2.tt)
    })

    it('tt cannot go backwards', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(200, null)
      state1.lock()

      // Try to create state with lower tt
      expect(() => {
        state1.tick(null, 100)  // 100 < 200 violates constraint
      }).to.throw('tt must not go backwards')
    })

    it('states_at_tt returns correct states', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(100, null)
      state1.lock()

      const state2 = state1.tick(null, 200)
      state2.lock()

      const state3 = state2.tick(null, 300)
      state3.lock()

      // Query at different tt values
      expect([...mind.states_at_tt(50)]).to.deep.equal([])
      expect([...mind.states_at_tt(100)]).to.deep.equal([state1])
      expect([...mind.states_at_tt(150)]).to.deep.equal([state1])
      expect([...mind.states_at_tt(200)]).to.deep.equal([state2])
      expect([...mind.states_at_tt(999)]).to.deep.equal([state3])
    })
  })

  describe('Error Conditions & Edge Cases', () => {
    it('ground_state must be in parent mind', () => {
      setupArchetypesWithMind()

      const world_mind1 = new Mind(logos(), 'world1')
      const world_state1 = world_mind1.create_state(100, null)

      const world_mind2 = new Mind(logos(), 'world2')
      const world_state2 = world_mind2.create_state(100, null)

      const npc_mind = new Mind(world_mind1, 'npc')

      // Create a dummy belief for the test
      const npc_belief = Belief.from_template(world_state1, {
        bases: ['Person']
      })

      // Try to use ground_state from wrong parent
      expect(() => {
        npc_mind.get_or_create_open_state_for_ground(world_state2, npc_belief)
      }).to.throw(/ground_state must be in parent mind/)
    })

    it('world mind tick requires explicit vt', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(100, null)
      state1.lock()

      // World mind (no ground_state) requires explicit vt
      const state2 = state1.tick(null, 200)

      expect(state2.tt).to.equal(200)
      expect(state2.vt).to.equal(200)
    })

    it('locked belief versioning requires existing state', () => {
      setupArchetypesWithMind()

      const world_mind = new Mind(logos(), 'world')
      const world_state = world_mind.create_state(100, null)

      const npc = world_state.add_belief_from_template({
        label: 'npc',
        bases: ['Person']
      })

      // Get NPC's mind BEFORE locking
      const npc_mind = npc.get_trait(world_state, 'mind')

      // Lock initial mind state
      const initial_npc_state = [...npc_mind.states_at_tt(world_state.vt)][0]
      initial_npc_state.lock()

      world_state.lock()

      // Create and lock first state (this should now be a NEW state since belief is locked)
      const npc_state1 = npc_mind.get_or_create_open_state_for_ground(world_state, npc)
      npc_state1.lock()

      // Lock the belief to trigger versioning path
      npc.locked = true

      // Now versioning should work (existing state found)
      const npc_state2 = npc_mind.get_or_create_open_state_for_ground(world_state, npc)
      expect(npc_state2).to.exist
    })

    it('next_tt must be set assertion', () => {
      const mind = new Mind(logos(), 'world')
      const state1 = mind.create_state(100, null)
      state1.lock()

      // Calling branch_state(null, null) should fail
      expect(() => {
        state1.branch_state(null, null)
      }).to.throw(/next_tt must be set/)
    })
  })
})
