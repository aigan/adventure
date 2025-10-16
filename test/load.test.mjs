import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { setupStandardArchetypes } from './helpers.mjs';

describe('Save/Load functionality', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('save_mind() and load()', () => {
    it('saves and loads a simple mind', () => {
      // Create simple world
      const world_mind = new DB.Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_mind.add({
        label: 'workshop',
        bases: ['Location'],
      });

      world_state.insert.push(workshop);

      // Save
      const json = DB.save_mind(world_mind);
      expect(json).to.be.a('string');

      // Clear and reload
      DB.reset_registries();
      setupStandardArchetypes();

      const loaded_mind = DB.load(json);

      // Verify structure
      expect(loaded_mind).to.be.instanceOf(DB.Mind);
      expect(loaded_mind.label).to.equal('world');
      expect(loaded_mind._id).to.equal(world_mind._id);
      expect(loaded_mind.state.size).to.equal(1);

      // Verify belief exists (lazy)
      const loaded_workshop = DB.Belief.by_label.get('workshop');
      expect(loaded_workshop).to.exist;
      expect(loaded_workshop._id).to.equal(workshop._id);
    });

    it('handles lazy loading - beliefs materialize on access', () => {
      // Create world with location relationship
      const world_mind = new DB.Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_mind.add({
        label: 'workshop',
        bases: ['Location'],
      });

      const hammer = world_mind.add({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          location: workshop,
        },
      });

      world_state.insert.push(workshop, hammer);

      // Save and reload
      const json = DB.save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = DB.load(json);

      // Get loaded beliefs
      const loaded_hammer = DB.Belief.by_label.get('hammer');
      const loaded_workshop = DB.Belief.by_label.get('workshop');

      // Initially lazy
      expect(loaded_hammer._lazy).to.not.be.null;

      // Access triggers materialization
      const location_trait = loaded_hammer.traits.get('location');
      expect(loaded_hammer._lazy).to.be.null;
      expect(location_trait).to.equal(loaded_workshop);
    });

    it('handles circular references', () => {
      // Create circular location refs
      const world_mind = new DB.Mind('world');
      const world_state = world_mind.create_state(1);

      const room1 = world_mind.add({
        label: 'room1',
        bases: ['Location'],
      });

      const room2 = world_mind.add({
        label: 'room2',
        bases: ['Location'],
        traits: {
          location: room1,
        },
      });

      // Update room1 to point back to room2
      const room1_v2 = new DB.Belief(world_mind, {
        bases: [room1],
        traits: {
          location: room2,
        },
      });

      world_state.insert.push(room1, room2);
      const state2 = world_state.tick({ replace: [room1_v2] });

      // Save and reload
      const json = DB.save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = DB.load(json);

      // Verify circular refs work
      // Find loaded beliefs by ID (traits store exact IDs, not labels)
      const loaded_room1_original = DB.Belief.by_id.get(3); // Original room1
      const loaded_room1_v2 = DB.Belief.by_id.get(5); // Versioned room1
      const loaded_room2 = DB.Belief.by_id.get(4);

      // room1_v2 location should point to room2
      const loc1 = loaded_room1_v2.traits.get('location');
      expect(loc1).to.equal(loaded_room2);

      // room2 location should point to original room1 (the reference it was created with)
      const loc2 = loaded_room2.traits.get('location');
      expect(loc2).to.equal(loaded_room1_original);
    });

    it('loads state chains with base references', () => {
      const world_mind = new DB.Mind('world');
      const state1 = world_mind.create_state(1);
      const ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
      });
      state1.insert.push(ball);

      const state2 = state1.tick({ insert: [] });
      const state3 = state2.tick({ insert: [] });

      // Save and reload
      const json = DB.save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = DB.load(json);

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
            mind_states: {
              _type: 'State',
              learn: {
                workshop: ['location']
              },
            }
          },
        },
      };

      const world_mind = new DB.Mind('world');
      let state = world_mind.create_state(1);
      state.add_beliefs(world_belief);

      const ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      state = state.tick({ insert: [ball] });
      state = state.tick_with_traits(ball, { color: 'blue' });

      // Get versioned ball's ID before saving
      const ball_v2 = [...state.get_beliefs()].find(b => b.get_display_label() === 'ball');
      const ball_v2_id = ball_v2._id;

      // Save and reload
      const json = DB.save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = DB.load(json);

      // Verify all beliefs loaded
      expect(DB.Belief.by_label.get('workshop')).to.exist;
      expect(DB.Belief.by_label.get('hammer')).to.exist;
      expect(DB.Belief.by_label.get('player')).to.exist;
      expect(DB.Belief.by_label.get('ball')).to.exist;

      // Verify player has mind_states
      const loaded_player = DB.Belief.by_label.get('player');
      const mind_states = loaded_player.traits.get('mind_states');
      expect(mind_states).to.be.an('array');
      expect(mind_states[0]).to.be.instanceOf(DB.State);

      // Verify ball has color (use ID to find exact versioned belief)
      const loaded_ball = DB.Belief.by_id.get(ball_v2_id);
      expect(loaded_ball).to.exist;
      expect(loaded_ball.traits.get('color')).to.equal('blue');
    });

    it('preserves and continues id_sequence', () => {
      const world_mind = new DB.Mind('world');
      const state = world_mind.create_state(1);
      const workshop = world_mind.add({
        label: 'workshop',
        bases: ['Location'],
      });
      state.insert.push(workshop);

      const max_id = Math.max(world_mind._id, state._id, workshop._id);

      // Save and reload
      const json = DB.save_mind(world_mind);
      DB.reset_registries();
      setupStandardArchetypes();
      DB.load(json);

      // Create new object - should have higher ID
      const new_mind = new DB.Mind('test');
      expect(new_mind._id).to.be.greaterThan(max_id);
    });

    it('handles state ground_state references', () => {
      const world_mind = new DB.Mind('world');
      const world_state = world_mind.create_state(1);

      const workshop = world_mind.add({
        label: 'workshop',
        bases: ['Location'],
      });
      world_state.insert.push(workshop);

      // Create player mind with ground_state
      const player_mind = new DB.Mind('player_mind');
      const player_state = player_mind.create_state(1, world_state);

      // Save and reload both minds
      const world_json = DB.save_mind(world_mind);
      const player_json = DB.save_mind(player_mind);

      DB.reset_registries();
      setupStandardArchetypes();

      const loaded_world = DB.load(world_json);
      const loaded_player = DB.load(player_json);

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
            mind_states: {
              _type: 'State',
              learn: {
                workshop: ['location']
              },
            }
          },
        },
      };

      const world_mind = new DB.Mind('world');
      let state = world_mind.create_state(1);
      state.add_beliefs(world_belief);

      // Add entities and create versions
      const ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      state = state.tick({ insert: [ball] });
      state = state.tick_with_traits(ball, { color: 'blue' });

      // Create circular reference
      const room1 = world_mind.add({
        label: 'room1',
        bases: ['Location'],
      });

      const room2 = world_mind.add({
        label: 'room2',
        bases: ['Location'],
        traits: {
          location: room1,
        },
      });

      const room1_v2 = new DB.Belief(world_mind, {
        bases: [room1],
        traits: {
          location: room2,
        },
      });

      state = state.tick({ insert: [room1, room2] });
      state = state.tick({ replace: [room1_v2] });

      // First save
      const json1 = DB.save_mind(world_mind);

      // Load
      DB.reset_registries();
      setupStandardArchetypes();
      const loaded_mind = DB.load(json1);

      // Second save
      const json2 = DB.save_mind(loaded_mind);

      // Compare JSON strings - should be identical
      expect(json2).to.equal(json1);
    });
  });
});
