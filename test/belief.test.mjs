import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

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

      const ball = Belief.from_template(state, {
        traits: {
          '@label': 'ball',
          location: 'workshop'
        },
        bases: ['PortableObject']
      });

      const ball_v2 = Belief.from_template(state, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      const inspected = ball_v2.to_inspect_view(state);
      expect(inspected.bases).to.include(ball._id);
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      expect(ball_v2.can_have_trait('location')).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(1);
      const hammer = Belief.from_template(state, {
        traits: {'@label': 'hammer'},
        bases: ['PortableObject']
      });

      const hammer_v2 = Belief.from_template(state, {
        bases: [hammer],
        traits: { color: 'black' }
      });

      const inspected = hammer_v2.to_inspect_view(state);
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
      const mind = new Mind(null, 'test');
      const state = mind.create_state(1);
      Belief.from_template(state, {traits: {'@label': 'workshop'}, bases: ['Location']});

      const workshop = get_first_belief_by_label('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new Mind(null, 'mind_a');
      const state_a = mind_a.create_state(1);
      const mind_b = new Mind(null, 'mind_b');
      const state_b = mind_b.create_state(1);

      const item_a = Belief.from_template(state_a, {traits: {'@label': 'item_unique_a'}, bases: ['PortableObject']});
      const item_b = Belief.from_template(state_b, {traits: {'@label': 'item_unique_b'}, bases: ['PortableObject']});

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('currently allows referencing other mind\'s beliefs in bases', () => {
      const mind_a = new Mind(null, 'mind_a');
      const state_a = mind_a.create_state(1);
      Belief.from_template(state_a, {traits: {'@label': 'workshop'}, bases: ['Location']});

      const mind_b = new Mind(null, 'mind_b');
      const state_b = mind_b.create_state(1);

      // Currently this works - mind_b can reference mind_a's belief
      const workshop_a = get_first_belief_by_label('workshop');
      const item = new Belief(state_b, workshop_a.subject, [workshop_a]);

      // item is a version of workshop_a, so it shares the same sid and label
      expect(item._bases.has(workshop_a)).to.be.true;
      expect(item.subject.sid).to.equal(workshop_a.subject.sid);
      expect(item.get_label()).to.equal('workshop');
    });
  });

  describe('SID System', () => {
    it('creates belief with both sid and _id from same sequence', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const workshop = Belief.from_template(state, {
        traits: {'@label': 'workshop'},
        bases: ['Location'],
      });

      // Should have both subject and _id
      expect(workshop).to.have.property('subject');
      expect(workshop).to.have.property('_id');

      // Subject.sid and _id should be positive integers
      expect(workshop.subject.sid).to.be.a('number');
      expect(workshop._id).to.be.a('number');

      // For a new subject, sid should be assigned first, then _id
      expect(workshop._id).to.be.greaterThan(workshop.subject.sid);
    });

    it('creates versioned belief with same sid but new _id', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room1 = Belief.from_template(state, {
        traits: {'@label': 'room1'},
        bases: ['Location'],
      });

      const original_sid = room1.subject.sid;
      const original_id = room1._id;

      // Create new version (explicitly pass sid for versioning)
      const room1_v2 = Belief.from_template(state, {
        sid: room1.subject.sid,
        bases: [room1],
        traits: {
          color: 'blue',
        },
      });

      // Should have same sid but different _id
      expect(room1_v2.subject.sid).to.equal(original_sid);
      expect(room1_v2._id).to.not.equal(original_id);
      expect(room1_v2._id).to.be.greaterThan(original_id);
    });

    it('registers beliefs in belief_by_subject registry', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room = Belief.from_template(state, {
        traits: {'@label': 'room'},
        bases: ['Location'],
      });

      // Should be in belief_by_subject registry
      expect(DB._reflect().belief_by_subject).to.exist;
      expect(DB._reflect().belief_by_subject.get(room.subject)).to.exist;

      // Registry should contain a Set of beliefs with this subject
      const beliefs_with_subject = DB._reflect().belief_by_subject.get(room.subject);
      expect(beliefs_with_subject).to.be.instanceof(Set);
      expect(beliefs_with_subject.has(room)).to.be.true;
    });

    it('registers multiple versions under same sid', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room_v1 = Belief.from_template(state, {
        traits: {'@label': 'room'},
        bases: ['Location'],
      });

      const room_v2 = Belief.from_template(state, {
        sid: room_v1.subject.sid,
        bases: [room_v1],
        traits: { color: 'red' },
      });

      const room_v3 = Belief.from_template(state, {
        sid: room_v1.subject.sid,
        bases: [room_v2],
        traits: { color: 'blue' },
      });

      // All three should share the same subject
      expect(room_v2.subject).to.equal(room_v1.subject);
      expect(room_v3.subject).to.equal(room_v1.subject);

      // All should be in belief_by_subject registry
      const beliefs_with_subject = DB._reflect().belief_by_subject.get(room_v1.subject);
      expect(beliefs_with_subject.size).to.equal(3);
      expect(beliefs_with_subject.has(room_v1)).to.be.true;
      expect(beliefs_with_subject.has(room_v2)).to.be.true;
      expect(beliefs_with_subject.has(room_v3)).to.be.true;
    });

    it('stores trait value as Subject when value is a Belief', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const workshop = Belief.from_template(state, {
        traits: {'@label': 'workshop'},
        bases: ['Location'],
      });

      const hammer = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          location: workshop.subject,
        },
        bases: ['PortableObject']
      });

      // Trait should store a Subject wrapping the sid
      const location_value = hammer._traits.get('location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value).to.equal(workshop.subject);
    });

    it('stores primitive values directly (not as sid)', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const ball = Belief.from_template(state, {
        traits: {
          '@label': 'ball',
          color: 'red',
        },
        bases: ['PortableObject']
      });

      // Primitives should be stored as-is
      expect(ball._traits.get('color')).to.equal('red');
    });

    it('associates label with sid, not _id', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room_v1 = Belief.from_template(state, {
        traits: {'@label': 'room'},
        bases: ['Location'],
      });

      const room_v2 = Belief.from_template(state, {
        sid: room_v1.subject.sid,
        bases: [room_v1],
        traits: { color: 'red' },
      });

      // Both versions should share the same label
      expect(DB._reflect().label_by_sid.get(room_v1.subject.sid)).to.equal('room');
      expect(DB._reflect().sid_by_label.get('room')).to.equal(room_v1.subject.sid);

      // v2 should have same sid, so same label association
      expect(room_v2.subject.sid).to.equal(room_v1.subject.sid);
    });

    it('lookup by label returns sid, then resolve in state', () => {
      const world_mind = new Mind(null, 'world');
      const state = world_mind.create_state(1);

      const room = state.add_belief({
        label: 'workshop',
        bases: ['Location'],
      });

      // Look up by label to get sid
      const sid = DB._reflect().sid_by_label.get('workshop');
      expect(sid).to.equal(room.subject.sid);

      // Then resolve in state context
      const resolved = state.get_belief_by_subject(room.subject);
      expect(resolved).to.equal(room);
    });
  });

  describe('get_timestamp()', () => {
    it('returns timestamp from origin_state for regular beliefs', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const hammer = Belief.from_template(state, {
        traits: {'@label': 'hammer'},
        bases: ['PortableObject']
      });

      expect(hammer.get_timestamp()).to.equal(100);
    });

    it('returns @timestamp meta-trait for shared beliefs (null ownership)', () => {
      // Create a shared belief with null ownership and @timestamp meta-trait
      const archetype = DB.get_archetype_by_label('Temporal');
      const belief = new Belief(null, null, [archetype]);

      belief.add_trait('@timestamp', 110);

      expect(belief.get_timestamp()).to.equal(110);
    });

    it('prefers @timestamp meta-trait over origin_state.timestamp', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const belief = Belief.from_template(state, {
        bases: ['PortableObject', 'Temporal']
      });

      // Add @timestamp that differs from origin_state.timestamp
      belief.add_trait('@timestamp', 200);

      // Should return @timestamp, not origin_state.timestamp
      expect(belief.get_timestamp()).to.equal(200);
    });

    it('returns 0 for beliefs without origin_state or @timestamp', () => {
      const belief = new Belief(null, null, []);

      expect(belief.get_timestamp()).to.equal(0);
    });

    it('handles undefined vs 0 correctly', () => {
      const archetype = DB.get_archetype_by_label('Temporal');
      const belief = new Belief(null, null, [archetype]);

      // No origin_state, no @timestamp -> returns 0
      expect(belief.get_timestamp()).to.equal(0);

      // Add explicit @timestamp of 0
      belief.add_trait('@timestamp', 0);

      // Should return 0 from @timestamp (not fall through to origin_state)
      expect(belief.get_timestamp()).to.equal(0);
    });
  });

  describe('Trait Value Inheritance', () => {
    it('returns trait from own _traits', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const workshop = state.add_belief({
        label: 'workshop',
        bases: ['Location']
      });

      const hammer = state.add_belief({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          location: workshop.subject,
          color: 'grey'
        }
      });

      const location_value = hammer.get_trait('location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer.get_trait('color')).to.equal('grey');
    });

    it('inherits trait value from base belief', () => {
      const mind = new Mind(null, 'test');
      const state1 = mind.create_state(100);

      const workshop = state1.add_belief({
        label: 'workshop',
        bases: ['Location']
      });

      const hammer_v1 = state1.add_belief({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          location: workshop.subject,
          color: 'grey'
        }
      });

      state1.lock();

      // Create v2 with only color changed
      const state2 = state1.tick({});
      const hammer_v2 = Belief.from_template(state2, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'
        }
      });

      // v2 should have color in _traits, but location inherited from v1
      expect(hammer_v2._traits.has('color')).to.be.true;
      expect(hammer_v2._traits.has('location')).to.be.false;

      // get_trait should find both
      expect(hammer_v2.get_trait('color')).to.equal('blue');
      const location_value = hammer_v2.get_trait('location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
    });

    it('own trait shadows inherited trait', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const hammer_v1 = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      const hammer_v2 = Belief.from_template(state, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'  // Shadows v1's grey
        }
      });

      expect(hammer_v2.get_trait('color')).to.equal('blue');
    });

    it('multi-level inheritance works', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const workshop = Belief.from_template(state, {
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const hammer_v1 = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          location: workshop.subject,
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      const hammer_v2 = Belief.from_template(state, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'
        }
      });

      const hammer_v3 = Belief.from_template(state, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v2],
        traits: {
          color: 'red'
        }
      });

      // v3 should find location all the way back in v1
      const location_value = hammer_v3.get_trait('location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer_v3.get_trait('color')).to.equal('red');
    });

    it('returns undefined for trait not in chain', () => {
      const mind = new Mind(null, 'test');
      const state = mind.create_state(100);

      const hammer = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      expect(hammer.get_trait('nonexistent')).to.be.null;
    });
  });
});
