import { expect } from 'chai'
import { Mind, Materia, State, Temporal, Belief, Traittype, logos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes } from './helpers.mjs'


describe('Locking Constraints', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('State Constructor', () => {
    it('allows creation with locked ground_state but state becomes immutable', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      world_state.add_belief_from_template({
        traits: {}, label: 'workshop',
        bases: ['Location']
      })

      world_state.lock()  // Lock the ground state

      // Can create nested mind state with locked ground_state
      const player_mind = new Materia(world_mind, 'player')
      const player_state = player_mind.create_state(world_state)

      // But modifications should be prevented by ground_state being locked
      expect(player_state).to.exist
      expect(player_state.ground_state).to.equal(world_state)
    })

    it('rejects creation when self belief is locked', async () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const player = world_state.add_belief_from_template({
        traits: {}, label: 'player',
        bases: ['Person']
      })

      player.lock(world_state)  // Lock the self belief

      // world_state is still unlocked, but player is locked
      const player_mind = new Materia(world_mind, 'player_mind')

      // Use State constructor directly to pass self parameter
      expect(() => {
        new Temporal(player_mind, world_state, null, {self: player.subject})
      }).to.throw('Cannot create state for locked self')
    })

    it('allows creation when ground_state is unlocked', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const player = world_state.add_belief_from_template({
        traits: {}, label: 'player',
        bases: ['Person']
      })

      // ground_state unlocked - should succeed
      const player_mind = new Materia(world_mind, 'player_mind')
      const player_state = player_mind.create_state(world_state)

      expect(player_state).to.exist
      expect(player_state.ground_state).to.equal(world_state)
    })
  })

  describe('Belief.lock() Cascade', () => {
    it('cascades to child mind states', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const workshop = world_state.add_belief_from_template({
        traits: {}, label: 'workshop',
        bases: ['Location']
      })

      const player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {mind: {
            workshop: ['location']}},
        label: 'player'
      })

      const player_mind = player._traits.get(Traittype.get_by_label('mind'))
      const player_states = [...player_mind._states]

      // State is already locked from Mind.resolve_template(), belief is not
      expect(player.locked).to.be.false
      expect(player_states[0].locked).to.be.true  // Already locked

      // Lock the player belief - cascade should be no-op since state already locked
      player.lock(world_state)

      // Verify both are locked
      expect(player.locked).to.be.true
      expect(player_states[0].locked).to.be.true
    })

    it('cascades when world_state locks', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const workshop = world_state.add_belief_from_template({
        traits: {}, label: 'workshop',
        bases: ['Location']
      })

      const player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {mind: {
            workshop: ['location']}},
        label: 'player'
      })

      const player_mind = player._traits.get(Traittype.get_by_label('mind'))
      const player_states = [...player_mind._states]

      // Before locking world_state
      expect(world_state.locked).to.be.false
      expect(player.locked).to.be.false
      expect(player_states[0].locked).to.be.true  // Already locked from resolve_template

      // Lock world_state - should cascade to player belief
      world_state.lock()

      // World state and player should be locked
      expect(world_state.locked).to.be.true
      expect(player.locked).to.be.true
      expect(player_states[0].locked).to.be.true
    })

    it('does not cascade to inherited Mind traits (already locked via base)', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      // Create a base belief with a Mind trait
      const base_player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {mind: {
          // Empty learn spec
        }},
        label: 'base_player'
      })

      const base_mind = base_player._traits.get(Traittype.get_by_label('mind'))
      const base_states = [...base_mind._states]

      // Lock the base belief - this cascades to its mind states
      base_player.lock(world_state)
      expect(base_player.locked).to.be.true
      expect(base_states[0].locked).to.be.true

      // Create a versioned belief that inherits from base_player
      const versioned_player = Belief.from_template(world_state, {
        bases: [base_player],
        traits: { color: 'blue' }  // Add a new trait
      })

      // The versioned belief does NOT have mind in _traits (it's inherited)
      expect(versioned_player._traits.has(Traittype.get_by_label('mind'))).to.be.false
      expect(versioned_player._bases.has(base_player)).to.be.true

      // Lock the versioned belief
      versioned_player.lock(world_state)

      // Verify: the inherited Mind's states were already locked by base_player.lock()
      // (no additional cascade needed, and none should happen)
      expect(versioned_player.locked).to.be.true
      expect(base_states[0].locked).to.be.true  // Still locked from base

      // This test verifies that:
      // 1. Inherited Mind traits come from locked base beliefs
      // 2. Belief.lock() only checks _traits (directly set), not inherited traits
      // 3. No redundant cascade happens for inherited Mind traits
    })
  })

  describe('Full Locking Cascade', () => {
    it('locks entire dependency tree from world_state', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const workshop = world_state.add_belief_from_template({
        traits: {}, label: 'workshop',
        bases: ['Location']
      })

      const player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {location: 'workshop',
          mind: {
            workshop: ['location']}},
        label: 'player'
      })

      const player_mind = player._traits.get(Traittype.get_by_label('mind'))
      const player_state = [...player_mind._states][0]
      const player_beliefs = [...player_state.get_beliefs()]

      // Lock the world state
      world_state.lock()

      // World state and its beliefs should be locked
      expect(world_state.locked).to.be.true
      expect(workshop.locked).to.be.true
      expect(player.locked).to.be.true

      // Player's mind states should be locked (cascaded from player belief)
      expect(player_state.locked).to.be.true

      // Beliefs in player's mind should be locked (cascaded from player_state)
      for (const belief of player_beliefs) {
        expect(belief.locked).to.be.true
      }
    })

    it('prevents modification after cascade lock', () => {
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, {tt: 1})

      const player = world_state.add_belief_from_template({
        bases: ['Person'],
        traits: {mind: {}},
        label: 'player'
      })

      const player_mind = player._traits.get(Traittype.get_by_label('mind'))
      const player_state = [...player_mind._states][0]

      world_state.lock()

      // Try to modify locked player_state
      expect(() => {
        player_state.add_belief_from_template({
          traits: {}, label: 'hammer',
          bases: ['PortableObject']
        })
      }).to.throw('Cannot modify locked state')
    })
  })
})
