import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes } from './helpers.mjs';

describe('Belief', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Belief Versioning', () => {
    it('with_traits creates new belief with base reference', () => {
      const state = createMindWithBeliefs('test', {
        workshop: {
          bases: ['Location']
        }
      });

      const ball = Belief.from_template(state.in_mind, {
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop'
        }
      });

      const ball_v2 = Belief.from_template(ball.in_mind, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      const inspected = ball_v2.inspect(state);
      expect(inspected.bases).to.include(ball._id);
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      expect(ball_v2.can_have_trait('location')).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const mind = new Mind('test');
      const state = mind.create_state(1);
      const hammer = Belief.from_template(mind, {
        label: 'hammer',
        bases: ['PortableObject']
      });

      const hammer_v2 = Belief.from_template(hammer.in_mind, {
        bases: [hammer],
        traits: { color: 'black' }
      });

      const inspected = hammer_v2.inspect(state);
      // hammer_v2 doesn't directly have archetypes in bases, inherits from base belief
      expect(inspected.bases).to.include(hammer._id);

      // But get_archetypes should walk to base
      const archetype_labels = [...hammer_v2.get_archetypes()].map(a => a.label);
      expect(archetype_labels).to.include('PortableObject');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('Mind Isolation', () => {
    it('beliefs store in_mind reference', () => {
      const mind = new Mind('test');
      Belief.from_template(mind, {label: 'workshop', bases: ['Location']});

      const workshop = DB.get_belief_by_label('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new Mind('mind_a');
      const mind_b = new Mind('mind_b');

      const item_a = Belief.from_template(mind_a, { label: 'item_unique_a', bases: ['PortableObject'] });
      const item_b = Belief.from_template(mind_b, { label: 'item_unique_b', bases: ['PortableObject'] });

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('currently allows referencing other mind\'s beliefs in bases', () => {
      const mind_a = new Mind('mind_a');
      Belief.from_template(mind_a, {label: 'workshop', bases: ['Location']});

      const mind_b = new Mind('mind_b');

      // Currently this works - mind_b can reference mind_a's belief
      const workshop_a = DB.get_belief_by_label('workshop');
      const item = new Belief(mind_b, {
        sid: workshop_a.sid,  // Explicitly creating a version in mind_b
        bases: [workshop_a]
      });

      // item is a version of workshop_a, so it shares the same sid and label
      expect(item.bases.has(workshop_a)).to.be.true;
      expect(item.sid).to.equal(workshop_a.sid);
      expect(item.get_label()).to.equal('workshop');
    });
  });

  describe('SID System', () => {
    it('creates belief with both sid and _id from same sequence', () => {
      const world_mind = new Mind('world');

      const workshop = Belief.from_template(world_mind, {
        label: 'workshop',
        bases: ['Location'],
      });

      // Should have both sid and _id
      expect(workshop).to.have.property('sid');
      expect(workshop).to.have.property('_id');

      // Both should be positive integers
      expect(workshop.sid).to.be.a('number');
      expect(workshop._id).to.be.a('number');

      // For a new subject, sid should be assigned first, then _id
      expect(workshop._id).to.be.greaterThan(workshop.sid);
    });

    it('creates versioned belief with same sid but new _id', () => {
      const world_mind = new Mind('world');

      const room1 = Belief.from_template(world_mind, {
        label: 'room1',
        bases: ['Location'],
      });

      const original_sid = room1.sid;
      const original_id = room1._id;

      // Create new version (explicitly pass sid for versioning)
      const room1_v2 = Belief.from_template(world_mind, {
        sid: room1.sid,
        bases: [room1],
        traits: {
          color: 'blue',
        },
      });

      // Should have same sid but different _id
      expect(room1_v2.sid).to.equal(original_sid);
      expect(room1_v2._id).to.not.equal(original_id);
      expect(room1_v2._id).to.be.greaterThan(original_id);
    });

    it('registers beliefs in belief_by_sid registry', () => {
      const world_mind = new Mind('world');

      const room = Belief.from_template(world_mind, {
        label: 'room',
        bases: ['Location'],
      });

      // Should be in belief_by_sid registry
      expect(DB.belief_by_sid).to.exist;
      expect(DB.belief_by_sid.get(room.sid)).to.exist;

      // Registry should contain a Set of beliefs with this sid
      const beliefs_with_sid = DB.belief_by_sid.get(room.sid);
      expect(beliefs_with_sid).to.be.instanceof(Set);
      expect(beliefs_with_sid.has(room)).to.be.true;
    });

    it('registers multiple versions under same sid', () => {
      const world_mind = new Mind('world');

      const room_v1 = Belief.from_template(world_mind, {
        label: 'room',
        bases: ['Location'],
      });

      const room_v2 = Belief.from_template(world_mind, {
        sid: room_v1.sid,
        bases: [room_v1],
        traits: { color: 'red' },
      });

      const room_v3 = Belief.from_template(world_mind, {
        sid: room_v1.sid,
        bases: [room_v2],
        traits: { color: 'blue' },
      });

      // All three should share the same sid
      expect(room_v2.sid).to.equal(room_v1.sid);
      expect(room_v3.sid).to.equal(room_v1.sid);

      // All should be in belief_by_sid registry
      const beliefs_with_sid = DB.belief_by_sid.get(room_v1.sid);
      expect(beliefs_with_sid.size).to.equal(3);
      expect(beliefs_with_sid.has(room_v1)).to.be.true;
      expect(beliefs_with_sid.has(room_v2)).to.be.true;
      expect(beliefs_with_sid.has(room_v3)).to.be.true;
    });

    it('stores trait value as Subject when value is a Belief', () => {
      const world_mind = new Mind('world');

      const workshop = Belief.from_template(world_mind, {
        label: 'workshop',
        bases: ['Location'],
      });

      const hammer = Belief.from_template(world_mind, {
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          location: workshop,
        },
      });

      // Trait should store a Subject wrapping the sid
      const location_value = hammer.traits.get('location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.sid);
      expect(location_value.archetype).to.equal('Location');
    });

    it('stores primitive values directly (not as sid)', () => {
      const world_mind = new Mind('world');

      const ball = Belief.from_template(world_mind, {
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          color: 'red',
        },
      });

      // Primitives should be stored as-is
      expect(ball.traits.get('color')).to.equal('red');
    });

    it('associates label with sid, not _id', () => {
      const world_mind = new Mind('world');

      const room_v1 = Belief.from_template(world_mind, {
        label: 'room',
        bases: ['Location'],
      });

      const room_v2 = Belief.from_template(world_mind, {
        sid: room_v1.sid,
        bases: [room_v1],
        traits: { color: 'red' },
      });

      // Both versions should share the same label
      expect(DB.label_by_sid.get(room_v1.sid)).to.equal('room');
      expect(DB.sid_by_label.get('room')).to.equal(room_v1.sid);

      // v2 should have same sid, so same label association
      expect(room_v2.sid).to.equal(room_v1.sid);
    });

    it('lookup by label returns sid, then resolve in state', () => {
      const world_mind = new Mind('world');
      const state = world_mind.create_state(1);

      const room = state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      // Look up by label to get sid
      const sid = DB.sid_by_label.get('workshop');
      expect(sid).to.equal(room.sid);

      // Then resolve in state context
      const resolved = state.resolve_subject(sid);
      expect(resolved).to.equal(room);
    });
  });
});
