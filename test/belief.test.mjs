import { expect } from 'chai';
import { Mind, State, Belief, Subject, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

const logos = () => DB.get_logos_mind();

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
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1, null);
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
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(1, null);
      Belief.from_template(state, {traits: {'@label': 'workshop'}, bases: ['Location']});

      const workshop = get_first_belief_by_label('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new Mind(logos(), 'mind_a');
      const state_a = mind_a.create_state(1, null);
      const mind_b = new Mind(logos(), 'mind_b');
      const state_b = mind_b.create_state(1, null);

      const item_a = Belief.from_template(state_a, {traits: {'@label': 'item_unique_a'}, bases: ['PortableObject']});
      const item_b = Belief.from_template(state_b, {traits: {'@label': 'item_unique_b'}, bases: ['PortableObject']});

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('currently allows referencing other mind\'s beliefs in bases', () => {
      const mind_a = new Mind(logos(), 'mind_a');
      const state_a = mind_a.create_state(1, null);
      Belief.from_template(state_a, {traits: {'@label': 'workshop'}, bases: ['Location']});

      const mind_b = new Mind(logos(), 'mind_b');
      const state_b = mind_b.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

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
      const world_mind = new Mind(logos(), 'world');
      const state = world_mind.create_state(1, null);

      const room = state.add_belief_from_template({
        traits: {'@label': 'workshop'},
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
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

      const hammer = Belief.from_template(state, {
        traits: {'@label': 'hammer'},
        bases: ['PortableObject']
      });

      expect(hammer.get_tt()).to.equal(100);
    });

    it('returns @timestamp meta-trait for shared beliefs (null ownership)', () => {
      // Create a shared belief with null ownership and @timestamp meta-trait
      const archetype = Archetype.get_by_label('Temporal');
      const belief = new Belief(null, null, [archetype]);

      belief.add_trait('@tt', 110);

      expect(belief.get_tt()).to.equal(110);
    });

    it('prefers @timestamp meta-trait over origin_state.timestamp', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

      const belief = Belief.from_template(state, {
        bases: ['PortableObject', 'Temporal']
      });

      // Add @tt that differs from origin_state.tt
      belief.add_trait('@tt', 200);

      // Should return @tt, not origin_state.tt
      expect(belief.get_tt()).to.equal(200);
    });

    it('returns -Infinity for timeless shared beliefs (no origin_state or @tt)', () => {
      const belief = new Belief(null, null, []);

      expect(belief.get_tt()).to.equal(-Infinity);
    });

    it('handles undefined vs explicit @tt:0 correctly', () => {
      const archetype = Archetype.get_by_label('Temporal');
      const belief = new Belief(null, null, [archetype]);

      // No origin_state, no @tt -> returns -Infinity (timeless)
      expect(belief.get_tt()).to.equal(-Infinity);

      // Add explicit @tt of 0
      belief.add_trait('@tt', 0);

      // Should return 0 from @tt (not fall through to origin_state)
      expect(belief.get_tt()).to.equal(0);
    });
  });

  describe('Trait Value Inheritance', () => {
    it('returns trait from own _traits', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

      const workshop = state.add_belief_from_template({
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const hammer = state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {'@label': 'hammer', location: workshop.subject,
          color: 'grey'}
      });

      const location_value = hammer.get_trait(state, 'location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer.get_trait(state, 'color')).to.equal('grey');
    });

    it('inherits trait value from base belief', () => {
      const mind = new Mind(logos(), 'test');
      const state1 = mind.create_state(100, null);

      const workshop = state1.add_belief_from_template({
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      const hammer_v1 = state1.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {'@label': 'hammer', location: workshop.subject,
          color: 'grey'}
      });

      state1.lock();

      // Create v2 with only color changed
      const state2 = state1.branch_state(null, 101);
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
      expect(hammer_v2.get_trait(state2, 'color')).to.equal('blue');
      const location_value = hammer_v2.get_trait(state2, 'location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
    });

    it('own trait shadows inherited trait', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

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

      expect(hammer_v2.get_trait(state, 'color')).to.equal('blue');
    });

    it('multi-level inheritance works', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

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
      const location_value = hammer_v3.get_trait(state, 'location');
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer_v3.get_trait(state, 'color')).to.equal('red');
    });

    it('returns undefined for trait not in chain', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

      const hammer = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      expect(hammer.get_trait(state, 'nonexistent')).to.be.null;
    });

    it('to_inspect_view includes inherited traits', () => {
      const mind = new Mind(logos(), 'test');
      const state = mind.create_state(100, null);

      const workshop = Belief.from_template(state, {
        traits: {'@label': 'workshop'},
        bases: ['Location']
      });

      // Create v1 with location and color
      const hammer_v1 = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          location: workshop.subject,
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      // Create v2 that only sets color (location should be inherited from v1)
      const hammer_v2 = Belief.from_template(state, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'
        }
      });

      // get_trait should find both own and inherited traits
      expect(hammer_v2.get_trait(state, 'color')).to.equal('blue');
      expect(hammer_v2.get_trait(state, 'location')).to.be.instanceOf(Subject);

      // to_inspect_view should show BOTH own and inherited traits
      const inspected = hammer_v2.to_inspect_view(state);
      expect(inspected.traits).to.have.property('color');
      expect(inspected.traits).to.have.property('location');
      expect(inspected.traits.color).to.equal('blue');
      expect(inspected.traits.location).to.deep.include({
        _ref: workshop._id,
        _type: 'Belief'
      });
    });
  });

  describe('Shared Belief Resolution', () => {
    it('inherits traits from shared belief prototype', () => {
      // Create shared belief "GenericSword" with damage: 10, weight: 5
      const generic_sword = Belief.create_shared_from_template(null, ['MeleeWeapon'], {
        '@tt': 100,
        '@label': 'GenericSword',
        damage: 10,
        weight: 5
      });

      expect(generic_sword.in_mind).to.be.null;
      expect(generic_sword.origin_state).to.be.null;

      // Create regular belief inheriting from GenericSword
      const mind = new Mind(logos(), 'player');
      const state = mind.create_state(200, null);

      const player_sword = Belief.from_template(state, {
        traits: {
          '@label': 'player_sword'
        },
        bases: [generic_sword]
      });

      // Should inherit traits from shared belief
      expect(player_sword.get_trait(state, 'damage')).to.equal(10);
      expect(player_sword.get_trait(state, 'weight')).to.equal(5);

      // Can override inherited traits
      player_sword.add_trait('damage', 15);
      expect(player_sword.get_trait(state, 'damage')).to.equal(15);
      expect(player_sword.get_trait(state, 'weight')).to.equal(5); // Still inherited
    });

    it('multiple beliefs reference same shared subject', () => {
      // Create shared belief "StandardSword" with damage: 10
      const standard_sword = Belief.create_shared_from_template(null, ['MeleeWeapon'], {
        '@tt': 100,
        '@label': 'StandardSword',
        damage: 10,
        weight: 3
      });

      // Create two different minds with beliefs inheriting from same shared belief
      const mind1 = new Mind(logos(), 'player1');
      const state1 = mind1.create_state(200, null);

      const sword_1 = Belief.from_template(state1, {
        traits: {
          '@label': 'sword_1',
          sharpness: 7
        },
        bases: [standard_sword]
      });

      const mind2 = new Mind(logos(), 'player2');
      const state2 = mind2.create_state(200, null);

      const sword_2 = Belief.from_template(state2, {
        traits: {
          '@label': 'sword_2',
          sharpness: 9
        },
        bases: [standard_sword]
      });

      // Both should inherit from same shared belief
      expect(sword_1.get_trait(state1, 'damage')).to.equal(10);
      expect(sword_2.get_trait(state2, 'damage')).to.equal(10);
      expect(sword_1.get_trait(state1, 'weight')).to.equal(3);
      expect(sword_2.get_trait(state2, 'weight')).to.equal(3);

      // Each has its own sharpness value (overrides shared belief's implicit null)
      expect(sword_1.get_trait(state1, 'sharpness')).to.equal(7);
      expect(sword_2.get_trait(state2, 'sharpness')).to.equal(9);

      // Both reference the same shared belief in their bases
      expect(sword_1._bases.has(standard_sword)).to.be.true;
      expect(sword_2._bases.has(standard_sword)).to.be.true;
    });

    it('resolves correct version at different timestamps', () => {
      // Create shared belief v1 at timestamp 100
      const seasonal_v1 = Belief.create_shared_from_template(null, ['Effect'], {
        '@tt': 100,
        '@label': 'SeasonalBonus',
        bonus: 5
      });

      // Create shared belief v2 at tt 200 (newer version)
      const seasonal_v2 = new Belief(null, seasonal_v1.subject, [seasonal_v1]);
      seasonal_v2.add_trait('@tt', 200);
      seasonal_v2.add_trait('bonus', 10);

      // Query at timestamp 150 -> should find v1
      const at_150 = [...seasonal_v1.subject.beliefs_at_tt(150)];
      expect(at_150).to.have.lengthOf(1);
      expect(at_150[0].get_trait(null, 'bonus')).to.equal(5);

      // Query at timestamp 250 -> should find v2
      const at_250 = [...seasonal_v1.subject.beliefs_at_tt(250)];
      expect(at_250).to.have.lengthOf(1);
      expect(at_250[0].get_trait(null, 'bonus')).to.equal(10);

      // Query at timestamp 50 (before v1) -> should find nothing
      const at_50 = [...seasonal_v1.subject.beliefs_at_tt(50)];
      expect(at_50).to.have.lengthOf(0);
    });

    it('resolves traits through shared belief chain', () => {
      // Create shared belief chain: Weapon (base damage) → Sword (adds sharpness)
      const weapon = Belief.create_shared_from_template(null, ['MeleeWeapon'], {
        '@tt': 100,
        '@label': 'Weapon',
        damage: 5,
        weight: 2
      });

      const sword = Belief.create_shared_from_template(null, [weapon], {
        '@tt': 100,
        '@label': 'Sword',
        sharpness: 8
      });

      // Create regular belief inheriting from Sword
      const mind = new Mind(logos(), 'player');
      const state = mind.create_state(200, null);

      const magic_sword = Belief.from_template(state, {
        traits: {
          '@label': 'magic_sword',
          weight: 1  // Override weight to be lighter
        },
        bases: [sword]
      });

      // Should resolve traits through entire chain
      expect(magic_sword.get_trait(state, 'weight')).to.equal(1);       // Own trait (overridden)
      expect(magic_sword.get_trait(state, 'sharpness')).to.equal(8);    // From Sword
      expect(magic_sword.get_trait(state, 'damage')).to.equal(5);       // From Weapon

      // Verify the chain structure
      expect(magic_sword._bases.has(sword)).to.be.true;
      expect(sword._bases.has(weapon)).to.be.true;
    });

    it('inherits from shared belief through regular belief chain', () => {
      // Create shared belief "Tool" with durability
      const tool = Belief.create_shared_from_template(null, ['Tool'], {
        '@tt': 100,
        '@label': 'GenericTool',
        durability: 100
      });

      const mind = new Mind(logos(), 'player');
      const state = mind.create_state(200, null);

      // Create regular belief inheriting from shared belief
      const hammer_v1 = Belief.from_template(state, {
        traits: {
          '@label': 'hammer',
          weight: 10
        },
        bases: [tool]
      });

      // Create version 2 inheriting from v1
      const hammer_v2 = Belief.from_template(state, {
        bases: [hammer_v1],
        traits: {
          weight: 12
        }
      });

      // v2 should inherit durability from shared belief through v1
      expect(hammer_v2.get_trait(state, 'weight')).to.equal(12);       // Own trait
      expect(hammer_v2.get_trait(state, 'durability')).to.equal(100);  // From shared Tool via hammer_v1

      // Verify chain: hammer_v2 → hammer_v1 → Tool (shared)
      expect(hammer_v2._bases.has(hammer_v1)).to.be.true;
      expect(hammer_v1._bases.has(tool)).to.be.true;
      expect(tool.in_mind).to.be.null;
    });

    it('get_shared_belief_by_state finds shared belief', () => {
      // Create shared belief for a subject
      const default_item = Belief.create_shared_from_template(null, ['Item'], {
        '@tt': 100,
        '@label': 'default_item',
        value: 50
      });

      // Create state in mind (no belief for default_item in this mind)
      const mind = new Mind(logos(), 'player');
      const state = mind.create_state(150, null);

      // subject.get_shared_belief_by_state should find the shared belief
      const found = default_item.subject.get_shared_belief_by_state(state);

      expect(found).to.not.be.null;
      expect(found).to.equal(default_item);
      expect(found.in_mind).to.be.null;  // Confirms it's the shared belief
      expect(found.get_trait(state, 'value')).to.equal(50);
    });

    it('shared beliefs not registered in belief_by_mind', () => {
      // Create shared belief
      const prototype = Belief.create_shared_from_template(null, ['Item'], {
        '@tt': 100,
        '@label': 'prototype_1',
        value: 42
      });

      // Shared belief should be in belief_by_subject
      const beliefs_by_subject = [...DB.get_beliefs_by_subject(prototype.subject)];
      expect(beliefs_by_subject).to.have.lengthOf.at.least(1);
      expect(beliefs_by_subject).to.include(prototype);

      // Shared belief should NOT be in belief_by_mind (no mind to index under)
      // We can't directly check belief_by_mind, but we can verify it has null mind
      expect(prototype.in_mind).to.be.null;

      // Create regular belief in a mind
      const mind = new Mind(logos(), 'player');
      const state = mind.create_state(200, null);
      const regular_belief = Belief.from_template(state, {
        traits: {
          '@label': 'regular_item'
        },
        bases: ['Thing']
      });

      // Regular belief SHOULD be in belief_by_mind
      const beliefs_in_mind = [...DB.get_beliefs_by_mind(mind)];
      expect(beliefs_in_mind).to.have.lengthOf.at.least(1);
      expect(beliefs_in_mind).to.include(regular_belief);
      expect(regular_belief.in_mind).to.equal(mind);
    });
  });

  describe('Shared Belief Scoping', () => {
    it('shared belief scoped to parent mind is accessible from child minds', () => {
      // Create parent mind with initial state
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(100, null);

      // Create shared belief scoped to world_mind (use existing Thing archetype)
      const cultural_knowledge = Belief.create_shared_from_template(world_mind, ['Thing'], {
        '@tt': 100,
        '@label': 'CityLore'
      });

      expect(cultural_knowledge.subject.ground_mind).to.equal(world_mind);

      // Create child mind (NPC under world)
      const npc_mind = new Mind(world_mind, 'npc1');
      const npc_state = npc_mind.create_state(200, world_state);

      // NPC should be able to access shared belief via from_template
      const npc_belief = Belief.from_template(npc_state, {
        bases: ['CityLore'],
        traits: {
          '@label': 'npc_knowledge'
        }
      });

      expect(npc_belief._bases.has(cultural_knowledge)).to.be.true;
    });

    it('shared belief NOT accessible from different parent mind hierarchy', () => {
      // Create first parent mind (world)
      const world_mind = new Mind(logos(), 'world');
      const world_state = world_mind.create_state(100, null);

      // Create shared belief scoped to world_mind
      const world_culture = Belief.create_shared_from_template(world_mind, ['Thing'], {
        '@tt': 100,
        '@label': 'WorldCulture'
      });

      // Create second parent mind (dream)
      const dream_mind = new Mind(logos(), 'dream');
      const dream_state = dream_mind.create_state(100, null);
      const dream_child_mind = new Mind(dream_mind, 'dreamer');
      const dream_child_state = dream_child_mind.create_state(200, dream_state);

      // Dream hierarchy should NOT be able to access world's shared belief
      expect(() => {
        Belief.from_template(dream_child_state, {
          bases: ['WorldCulture'],
          traits: {'@label': 'dream_belief'}
        });
      }).to.throw(/Base 'WorldCulture' not found/);
    });

    it('multiple parents can create different shared beliefs with same subject label', () => {
      // Create two parent minds with states
      const world_mind = new Mind(logos(), 'world');
      const world_parent_state = world_mind.create_state(100, null);
      const dream_mind = new Mind(logos(), 'dream');
      const dream_parent_state = dream_mind.create_state(100, null);

      // Each creates shared belief (different labels since labels must be globally unique)
      const world_tavern = Belief.create_shared_from_template(world_mind, ['Thing'], {
        '@tt': 100,
        '@label': 'WorldTavern'
      });

      const dream_tavern = Belief.create_shared_from_template(dream_mind, ['Thing'], {
        '@tt': 100,
        '@label': 'DreamTavern'
      });

      expect(world_tavern.subject.ground_mind).to.equal(world_mind);
      expect(dream_tavern.subject.ground_mind).to.equal(dream_mind);
      expect(world_tavern.subject).to.not.equal(dream_tavern.subject); // Different subjects

      // World child sees world version
      const world_child = new Mind(world_mind, 'world_npc');
      const world_state = world_child.create_state(200, world_parent_state);
      const world_belief = Belief.from_template(world_state, {
        bases: ['WorldTavern'],
        traits: {'@label': 'world_tavern_instance'}
      });
      expect(world_belief._bases.has(world_tavern)).to.be.true;

      // Dream child sees dream version
      const dream_child = new Mind(dream_mind, 'dreamer');
      const dream_state = dream_child.create_state(200, dream_parent_state);
      const dream_belief = Belief.from_template(dream_state, {
        bases: ['DreamTavern'],
        traits: {'@label': 'dream_tavern_instance'}
      });
      expect(dream_belief._bases.has(dream_tavern)).to.be.true;
    });

    it('global shared belief (ground_mind=null) accessible from any parent', () => {
      // Create global shared belief (no scoping)
      const generic_weapon = Belief.create_shared_from_template(null, ['Thing'], {
        '@tt': 100,
        '@label': 'GenericWeapon'
      });

      expect(generic_weapon.subject.ground_mind).to.be.null;

      // Create two separate parent hierarchies
      const world_mind = new Mind(logos(), 'world');
      const world_parent_state = world_mind.create_state(100, null);
      const world_npc = new Mind(world_mind, 'guard');
      const world_state = world_npc.create_state(200, world_parent_state);

      const dream_mind = new Mind(logos(), 'dream');
      const dream_parent_state = dream_mind.create_state(100, null);
      const dream_npc = new Mind(dream_mind, 'phantom');
      const dream_state = dream_npc.create_state(200, dream_parent_state);

      // Both should be able to access the global shared belief
      const world_weapon = Belief.from_template(world_state, {
        bases: ['GenericWeapon'],
        traits: {'@label': 'guard_sword'}
      });
      expect(world_weapon._bases.has(generic_weapon)).to.be.true;

      const dream_weapon = Belief.from_template(dream_state, {
        bases: ['GenericWeapon'],
        traits: {'@label': 'phantom_blade'}
      });
      expect(dream_weapon._bases.has(generic_weapon)).to.be.true;
    });
  });
});
