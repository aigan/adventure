import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as Cosmos from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupMinimalArchetypes, setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

describe('State', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('Iteration Patterns', () => {
    it('mind.belief Set contains all beliefs for that mind', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(1);
      Belief.from_template(state, {traits: {'@label': 'workshop'}, bases: ['Location']});

      const hammer = Belief.from_template(state, {
        traits: {'@label': 'hammer'},
        bases: ['PortableObject']
      });

      expect([...DB._reflect().belief_by_id.values()].filter(b => b.in_mind === mind).length).to.equal(2);
      expect([...DB._reflect().belief_by_id.values()].some(b => b.in_mind === mind && b === get_first_belief_by_label('workshop'))).to.be.true;
      expect([...DB._reflect().belief_by_id.values()].some(b => b.in_mind === mind && b === hammer)).to.be.true;
    });

    it('can iterate over beliefs for a mind', () => {
      const state = createMindWithBeliefs('test', {
        workshop: { bases: ['Location'] },
        hammer: { bases: ['PortableObject'] }
      });
      const mind = state.in_mind;

      const labels = [];
      for (const belief of DB._reflect().belief_by_id.values()) {
        if (belief.in_mind === mind) {
          labels.push(belief.get_label());
        }
      }

      expect(labels).to.have.members(['workshop', 'hammer']);
    });

    it('mind.belief_by_label provides fast label lookup', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(1);
      Belief.from_template(state, {traits: {'@label': 'workshop'}, bases: ['Location']});

      expect(get_first_belief_by_label('workshop')).to.exist;
      expect(get_first_belief_by_label('workshop').get_label()).to.equal('workshop');
    });
  });

  describe('Cross-Mind Visibility', () => {
    it('state.get_beliefs only returns beliefs from that state\'s mind', () => {
      const mind_a = new Mind(null, 'mind_a');
      const state_a = mind_a.create_state(1);
      Belief.from_template(state_a, {traits: {'@label': 'item_a'}, bases: ['PortableObject']});
      const beliefs_for_a = [...DB._reflect().belief_by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_for_a);

      const mind_b = new Mind(null, 'mind_b');
      const state_b = mind_b.create_state(1);
      Belief.from_template(state_b, {traits: {'@label': 'item_b'}, bases: ['PortableObject']});
      const beliefs_for_b = [...DB._reflect().belief_by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_for_b);

      const beliefs_a = [...state_a.get_beliefs()];
      const beliefs_b = [...state_b.get_beliefs()];

      expect(beliefs_a).to.have.lengthOf(1);
      expect(beliefs_a[0].get_label()).to.equal('item_a');

      expect(beliefs_b).to.have.lengthOf(1);
      expect(beliefs_b[0].get_label()).to.equal('item_b');
    });

    it('beliefs from different minds don\'t mix in states', () => {
      const mind_a = new Mind(null, 'mind_a');
      const state_a = mind_a.create_state(1);
      Belief.from_template(state_a, {traits: {'@label': 'workshop_a'}, bases: ['Location']});

      const mind_b = new Mind(null, 'mind_b');
      const state_b = mind_b.create_state(1);
      Belief.from_template(state_b, {traits: {'@label': 'workshop_b'}, bases: ['Location']});

      const beliefs_a = [...DB._reflect().belief_by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_a);
      const beliefs_b = [...DB._reflect().belief_by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_b);

      const labels_a = [...state_a.get_beliefs()].map(b => b.get_label());
      const labels_b = [...state_b.get_beliefs()].map(b => b.get_label());

      expect(labels_a).to.deep.equal(['workshop_a']);
      expect(labels_b).to.deep.equal(['workshop_b']);
    });
  });

  describe('State Operations', () => {
    it('state.tick with replace removes correct belief', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(1);
      Belief.from_template(state1, {traits: {'@label': 'hammer_v1'}, bases: ['PortableObject']});

      const hammer_v1 = get_first_belief_by_label('hammer_v1');
      const hammer_v2 = Belief.from_template(state1, {
        bases: [hammer_v1],
        traits: { color: 'red' }
      });

      const state2 = state1.tick(null, 2, { replace: [hammer_v2] });

      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(1);
      expect(beliefs[0]).to.equal(hammer_v2);
      expect(beliefs[0]._traits.get('color')).to.equal('red');
    });

    it('multiple minds can have states without interference', () => {
      const mind_a = new Mind(null, 'mind_a');
      const state_a1 = mind_a.create_state(1);
      Belief.from_template(state_a1, {traits: {'@label': 'item_in_a'}, bases: ['PortableObject']});

      const mind_b = new Mind(null, 'mind_b');
      const state_b1 = mind_b.create_state(1);
      Belief.from_template(state_b1, {traits: {'@label': 'item_in_b'}, bases: ['PortableObject']});

      // Add different beliefs to each mind
      const item_a = get_first_belief_by_label('item_in_a');
      const item_a2 = Belief.from_template(state_a1, {
        bases: [item_a],
        traits: { color: 'red' }
      });
      const state_a2 = state_a1.tick(null, 2, { replace: [item_a2] });

      const item_b = get_first_belief_by_label('item_in_b');
      const item_b2 = Belief.from_template(state_b1, {
        bases: [item_b],
        traits: { color: 'blue' }
      });
      const state_b2 = state_b1.tick(null, 2, { replace: [item_b2] });

      // Verify states are independent
      const beliefs_a = [...state_a2.get_beliefs()];
      const beliefs_b = [...state_b2.get_beliefs()];

      expect(beliefs_a[0]._traits.get('color')).to.equal('red');
      expect(beliefs_b[0]._traits.get('color')).to.equal('blue');
    });

    it('state inheritance chain works correctly', () => {
      const state1 = createMindWithBeliefs('test', {
        item1: { bases: ['PortableObject'] },
        item2: { bases: ['PortableObject'] }
      });
      const mind = state1.in_mind;

      const item3 = Belief.from_template(state1, {traits: {'@label': 'item3'}, bases: ['PortableObject']});
      const state2 = state1.tick(null, 2, { insert: [item3] });

      // state2 should have all three items
      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(3);

      const labels = beliefs.map(b => b.get_label()).sort();
      expect(labels).to.deep.equal(['item1', 'item2', 'item3']);
    });
  });

  describe('Ground State and Branches', () => {
    it('creates root state with null ground_state', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(1);

      expect(state.ground_state).to.be.null;
    });

    it('creates nested mind state with ground_state', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_state = npc_mind.create_state(1, world_state);

      expect(npc_state.ground_state).to.equal(world_state);
    });

    it('tick() inherits ground_state from parent', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_state1 = npc_mind.create_state(1, world_state);
      const npc_state2 = npc_state1.tick(world_state);

      expect(npc_state2.ground_state).to.equal(world_state);
    });

    it('tick() can override ground_state', () => {
      const world_mind = new Mind(null, 'world');
      const world_state1 = world_mind.create_state(1);
      const world_state2 = world_state1.tick(null, 2);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_state1 = npc_mind.create_state(1, world_state1);
      const npc_state2 = npc_state1.tick(world_state2);

      expect(npc_state2.ground_state).to.equal(world_state2);
    });

    it('tracks branches forward from parent state', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(1);
      const state2 = state1.tick(null, 2);
      const state3 = state1.tick(null, 3);

      expect(state1.get_branches()).to.have.lengthOf(2);
      expect(state1.get_branches()).to.include(state2);
      expect(state1.get_branches()).to.include(state3);
    });

    it('serializes ground_state in toJSON', () => {
      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const npc_mind = new Mind(world_mind, 'npc');
      const npc_state = npc_mind.create_state(1, world_state);

      const json = npc_state.toJSON();
      expect(json.ground_state).to.equal(world_state._id);
    });
  });

  describe('SID Resolution', () => {
    beforeEach(() => {
      DB.reset_registries();
      setupStandardArchetypes();
    });

    it('resolves sid to appropriate belief version in state', () => {
      const world_mind = new Mind(null, 'world');
      const state1 = world_mind.create_state(1);

      const room = state1.add_belief({
        traits: {'@label': 'room'},
        bases: ['Location'],
      });

      // Should resolve to the belief
      const resolved = state1.get_belief_by_subject(room.subject);
      expect(resolved).to.equal(room);
    });

    it('resolves to latest version visible in state', () => {
      const world_mind = new Mind(null, 'world');
      const state1 = world_mind.create_state(1);

      const room_v1 = state1.add_belief({
        traits: {'@label': 'room'},
        bases: ['Location'],
      });

      // Create v2 and add to state2
      const room_v2 = Belief.from_template(state1, {
        sid: room_v1.subject.sid,
        bases: [room_v1],
        traits: { color: 'red' },
      });
      const state2 = state1.tick(null, 2, { replace: [room_v2] });

      // state1 should resolve to v1
      expect(state1.get_belief_by_subject(room_v1.subject)).to.equal(room_v1);

      // state2 should resolve to v2
      expect(state2.get_belief_by_subject(room_v1.subject)).to.equal(room_v2);
    });

    it('builds sid index on-demand for efficient lookups', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room1 = state.add_belief({ bases: ['Location'], traits: {'@label': 'room1'} });
      const room2 = state.add_belief({ bases: ['Location'], traits: {'@label': 'room2'} });

      // Lock state to enable caching
      state.lock();

      // First resolution should progressively build cache
      const resolved1 = state.get_belief_by_subject(room1.subject);
      expect(resolved1).to.equal(room1);

      // Check that index was created (implementation detail)
      expect(state._subject_index).to.exist;
      expect(state._subject_index.has(room1.subject)).to.be.true;

      // Second resolution should use cached index
      const resolved2 = state.get_belief_by_subject(room2.subject);
      expect(resolved2).to.equal(room2);

      // Cache should now have both rooms
      expect(state._subject_index.has(room2.subject)).to.be.true;
    });

    it('fixes circular reference problem - traits point to subject, not version', () => {
      const world_mind = new Mind(null, 'world');
      const state1 = world_mind.create_state(1);

      // Create two rooms with circular reference
      const room1 = state1.add_belief({
        traits: {'@label': 'room1'},
        bases: ['Location'],
      });

      const room2 = state1.add_belief({
        bases: ['Location'],
        traits: {'@label': 'room2', location: room1.subject}  // room2 inside room1
      });

      // Now update room1 to be inside room2
      const room1_v2 = Belief.from_template(state1, {
        sid: room1.subject.sid,
        bases: [room1],
        traits: {
          location: room2.subject,  // room1 now inside room2
        },
      });
      const state2 = state1.tick(null, 2, { replace: [room1_v2] });

      // THE KEY TEST: room2's location trait stores a Subject
      const room2_location = room2._traits.get('location');
      expect(room2_location).to.be.instanceOf(Subject);
      expect(room2_location).to.equal(room1.subject);

      // In state1: room2.location resolves to room1 (no location trait)
      const room2_location_in_state1 = room2_location.get_belief_by_state(state1);
      expect(room2_location_in_state1).to.equal(room1);
      expect(room2_location_in_state1._traits.get('location')).to.be.undefined;

      // In state2: room2.location resolves to room1_v2 (has location trait)
      const room2_location_in_state2 = room2_location.get_belief_by_state(state2);
      expect(room2_location_in_state2).to.equal(room1_v2);

      // And room1_v2's location points back to room2
      const room1_v2_location = room2_location_in_state2._traits.get('location');
      expect(room1_v2_location).to.be.instanceOf(Subject);
      expect(room1_v2_location).to.equal(room2.subject);

      // This creates a proper circular reference in state2
      const room1_v2_location_resolved = room1_v2_location.get_belief_by_state(state2);
      expect(room1_v2_location_resolved).to.equal(room2);
    });
  });

  describe('State self property', () => {
    beforeEach(() => {
      DB.reset_registries();
      setupStandardArchetypes();
    });

    it('creates state with self reference', () => {
      const mind = new Mind(null, 'test');
      const temp_state = mind.create_state(1);

      // Create a belief to be self
      const body = Belief.from_template(temp_state, {
        traits: {'@label': 'body'},
        bases: ['Actor']
      });

      // Create state with self
      const state = new State(
        mind,
        2,
        null,
        null,
        body.subject
      );

      expect(state.self).to.equal(body.subject);
    });

    it('branch_state inherits self from parent', () => {
      const mind = new Mind(null, 'test');
      const temp_state = mind.create_state(1);
      const body = Belief.from_template(temp_state, {
        traits: {'@label': 'body'},
        bases: ['Actor']
      });

      const state1 = new State(mind, 2, null, null, body.subject);
      state1.lock();

      const state2 = state1.branch_state(null, 3);

      expect(state2.self).to.equal(body.subject);
      expect(state2.self).to.equal(state1.self);
    });

    it('tick inherits self from parent', () => {
      const mind = new Mind(null, 'test');
      const temp_state = mind.create_state(1);
      const body = Belief.from_template(temp_state, {
        traits: {'@label': 'body'},
        bases: ['Actor']
      });

      const state1 = new State(mind, 2, null, null, body.subject);
      const state2 = state1.tick(null, 2);

      expect(state2.self).to.equal(body.subject);
      expect(state2.self).to.equal(state1.self);
    });

    it('serializes and deserializes self', () => {
      const mind = new Mind(null, 'test');
      const temp_state = mind.create_state(1);
      const body = Belief.from_template(temp_state, {
        traits: {'@label': 'body'},
        bases: ['Actor']
      });

      const state = new State(mind, 2, null, null, body.subject);

      const json = state.toJSON();
      expect(json.self).to.equal(body.subject.sid);
    });

    it('allows null self for root minds', () => {
      const mind = new Mind(null, 'world');
      const state = mind.create_state(1);

      expect(state.self).to.be.null;
    });

    it('Mind.create_from_template sets state.self from owner_belief subject', () => {
      DB.reset_registries();
      setupStandardArchetypes();

      const world_mind = new Mind(null, 'world');
      const world_state = world_mind.create_state(1);

      const player_body = Belief.from_template(world_state, {
        traits: {'@label': 'player_body'},
        bases: ['Actor']
      });

      world_state.insert_beliefs(player_body);
      world_state.lock();

      // Create player with mind trait using create_from_template
      // Person archetype has Mental which has mind trait
      const player = Belief.from_template(world_state, {
        traits: {
          '@label': 'player',
          mind: {
            // empty learn spec
          }
        },
        bases: ['Person']
      });

      const player_mind = player._traits.get('mind');
      expect(player_mind).to.be.instanceOf(Mind);

      const states = [...player_mind._states];
      const player_state = states[0];

      expect(player_state.self).to.equal(player.subject);
      expect(player_state.ground_state).to.equal(world_state);
    });
  });
});
