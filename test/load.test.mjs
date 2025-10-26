import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

describe('Save/Load functionality', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('save_mind() and load()', () => {
    it('saves and loads a simple mind', () => {
      // Create simple world
      const world_mind = new Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      // Save
      const json = save_mind(world_mind);
      expect(json).to.be.a('string');

      // Clear and reload
      DB.reset_registries();
      setupStandardArchetypes();

      const loaded_mind = load(json);

      // Verify structure
      expect(loaded_mind).to.be.instanceOf(Mind);
      expect(loaded_mind.label).to.equal('world');
      expect(loaded_mind._id).to.equal(world_mind._id);
      expect(loaded_mind.state.size).to.equal(1);

      // Verify belief exists (lazy)
      const loaded_workshop = get_first_belief_by_label('workshop');
      expect(loaded_workshop).to.exist;
      expect(loaded_workshop._id).to.equal(workshop._id);
    });

    it('handles belief trait references after save/load', () => {
      // Create world with location relationship
      const world_mind = new Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      const hammer = world_state.add_belief({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          location: workshop.subject,
        },
      });

      // Save and reload
      const json = save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = load(json);

      // Get loaded beliefs
      const loaded_hammer = get_first_belief_by_label('hammer');
      const loaded_workshop = get_first_belief_by_label('workshop');
      const loaded_state = [...loaded_mind.state][0];

      // Trait reference should be resolved correctly after load
      const location_trait = loaded_hammer.get_trait('location');
      expect(location_trait).to.equal(loaded_workshop.subject);
    });

    it('handles circular references with temporal consistency', () => {
      // This test verifies the SID system fixes the "time-travel" bug where
      // circular trait references would point to old versions from previous states

      const world_mind = new Mind('world');
      const state1 = world_mind.create_state(1);

      const room1 = state1.add_belief({
        label: 'room1',
        bases: ['Location'],
      });

      const room2 = state1.add_belief({
        label: 'room2',
        bases: ['Location'],
        traits: {
          location: room1.subject,  // room2 → room1 in state1
        },
      });

      // State 2: Update room1 to point back to room2 (creates circular reference)
      const room1_v2 = Belief.from_template(state1, {
        sid: room1.subject.sid,
        bases: [room1],
        traits: {
          location: room2.subject,  // room1_v2 → room2 in state2
        },
      });

      const state2 = state1.tick({ replace: [room1_v2] });

      // Save and reload
      const json = save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = load(json);

      // Get state2 (the one with the circular reference)
      const loaded_state2 = [...loaded_mind.state].find(s => s.timestamp === 2);
      expect(loaded_state2).to.exist;

      // Get the beliefs
      const loaded_room1 = get_first_belief_by_label('room1');
      const loaded_room2 = get_first_belief_by_label('room2');
      // room1_v2 is a version of room1 (has room1 as base)
      const loaded_room1_v2 = [...DB._reflect().belief_by_id.values()].find(b =>
        b !== loaded_room1 && b._bases.size === 1 && [...b._bases][0] === loaded_room1
      );

      expect(loaded_room1).to.exist;
      expect(loaded_room2).to.exist;
      expect(loaded_room1_v2).to.exist;

      // CRITICAL TEST: Verify temporal consistency in state2
      // room1_v2.location should resolve to room2
      const loc1 = loaded_room1_v2.get_trait('location')?.get_belief_by_state(loaded_state2);
      expect(loc1).to.equal(loaded_room2);

      // room2.location should resolve to room1_v2 (NOT old room1!)
      // This proves SIDs resolve to current version in state context (no time-travel)
      const loc2 = loaded_room2.get_trait('location')?.get_belief_by_state(loaded_state2);
      expect(loc2).to.equal(loaded_room1_v2, 'room2 should point to room1_v2 in state2, not old room1');

      // Following the circular reference should stay in state2's temporal context
      const circular_check = loaded_room1_v2.get_trait('location')?.get_belief_by_state(loaded_state2)
        ?.get_trait('location')?.get_belief_by_state(loaded_state2);
      expect(circular_check).to.equal(loaded_room1_v2, 'circular reference should stay in current state');
    });

    it('loads state chains with base references', () => {
      const world_mind = new Mind('world');
      const state1 = world_mind.create_state(1);
      const ball = state1.add_belief({
        label: 'ball',
        bases: ['PortableObject'],
      });

      const state2 = state1.tick({ insert: [] });
      const state3 = state2.tick({ insert: [] });

      // Save and reload
      const json = save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = load(json);

      // Get states
      const states = [...loaded_mind.state];
      expect(states).to.have.lengthOf(3);

      // Verify state chain via base references
      const s3 = states.find(s => s.timestamp === 3);
      const s2 = states.find(s => s.timestamp === 2);
      const s1 = states.find(s => s.timestamp === 1);

      expect(s3.base).to.equal(s2);
      expect(s2.base).to.equal(s1);
      expect(s1.base).to.be.null;
    });

    it('loads complex world.mjs structure', () => {
      // Replicate world.mjs setup
      const world_belief = {
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
          },
        },
        player: {
          bases: ['Person'],
          traits: {
            location: 'workshop',
            mind: {
              workshop: ['location']
            }
          },
        },
      };

      const world_mind = new Mind('world');
      let state = world_mind.create_state(1);
      state.add_beliefs(world_belief);

      const ball = state.add_belief({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      state = state.tick({ insert: [] });
      state = state.tick_with_traits(ball, { color: 'blue' });

      // Get versioned ball's ID before saving
      const ball_v2 = [...state.get_beliefs()].find(b => b.get_label() === 'ball');
      const ball_v2_id = ball_v2._id;

      // Save and reload
      const json = save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = load(json);

      // Verify all beliefs loaded
      expect(get_first_belief_by_label('workshop')).to.exist;
      expect(get_first_belief_by_label('hammer')).to.exist;
      expect(get_first_belief_by_label('player')).to.exist;
      expect(get_first_belief_by_label('ball')).to.exist;

      // Verify player has mind
      const loaded_player = get_first_belief_by_label('player');
      const player_mind = loaded_player._traits.get('mind');
      expect(player_mind).to.be.instanceOf(Mind);
      const states = [...player_mind.state];
      expect(states.length).to.be.at.least(1);
      expect(states[0]).to.be.instanceOf(State);

      // Verify ball has color (use ID to find exact versioned belief)
      const loaded_ball = DB._reflect().belief_by_id.get(ball_v2_id);
      expect(loaded_ball).to.exist;
      expect(loaded_ball._traits.get('color')).to.equal('blue');
    });

    it('preserves and continues id_sequence', () => {
      const world_mind = new Mind('world');
      const state = world_mind.create_state(1);
      const workshop = state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      const max_id = Math.max(world_mind._id, state._id, workshop._id);

      // Save and reload
      const json = save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      load(json);

      // Create new object - should have higher ID
      const new_mind = new Mind('test');
      expect(new_mind._id).to.be.greaterThan(max_id);
    });

    it('handles state ground_state references', () => {
      const world_mind = new Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      // Create player mind with ground_state
      const player_mind = new Mind('player_mind');
      const player_state = player_mind.create_state(1, world_state);

      // Save and reload both minds
      const world_json = save_mind(world_mind);
      const player_json = save_mind(player_mind);

      DB.reset_registries();
      setupStandardArchetypes();

      const loaded_world = load(world_json);
      const loaded_player = load(player_json);

      // Verify ground_state reference
      const loaded_world_state = [...loaded_world.state][0];
      const loaded_player_state = [...loaded_player.state][0];

      expect(loaded_player_state.ground_state).to.equal(loaded_world_state);
    });

    it('save-load-save produces identical JSON (idempotency)', () => {
      // Create complex world with multiple features:
      // - Multiple states with versioned beliefs
      // - Circular references
      // - Nested minds with ground_state
      // - Arrays and complex traits
      const world_belief = {
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
          },
        },
        player: {
          bases: ['Person'],
          traits: {
            location: 'workshop',
            mind: {
              workshop: ['location']
            }
          },
        },
      };

      const world_mind = new Mind('world');
      let state = world_mind.create_state(1);
      state.add_beliefs(world_belief);

      // Add entities and create versions
      const ball = state.add_belief({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      // Create circular reference first (before locking state)
      const room1 = state.add_belief({
        label: 'room1',
        bases: ['Location'],
      });

      const room2 = state.add_belief({
        label: 'room2',
        bases: ['Location'],
        traits: {
          location: room1,
        },
      });

      state = state.tick_with_traits(ball, { color: 'blue' });

      const room1_v2 = Belief.from_template(state, {
        bases: [room1],
        traits: {
          location: room2,
        },
      });
      state = state.tick({ replace: [room1_v2] });

      // First save
      const json1 = save_mind(world_mind);

      // Load
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = load(json1);

      // Second save
      const json2 = save_mind(loaded_mind);

      // Compare JSON strings - should be identical
      expect(json2).to.equal(json1);
    });
  });
});
