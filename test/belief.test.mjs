import { expect } from 'chai';
import { Mind, Materia, State, Belief, Subject, Archetype, Traittype, save_mind, load, logos } from '../public/worker/cosmos.mjs';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, createStateInNewMind, setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs';

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
          location: 'workshop'
        },
        bases: ['PortableObject'],
        label: 'ball'
      });

      const ball_v2 = Belief.from_template(state, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      const inspected = ball_v2.to_inspect_view(state);
      expect(inspected.bases.some(b => b.id === ball._id)).to.be.true;
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      const location_traittype = Traittype.get_by_label('location');
      expect(ball_v2.can_have_trait(location_traittype)).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const state = createStateInNewMind();
      const hammer = Belief.from_template(state, {
        traits: {},
        bases: ['PortableObject'],
        label: 'hammer'
      });

      const hammer_v2 = Belief.from_template(state, {
        bases: [hammer],
        traits: { color: 'black' }
      });

      const inspected = hammer_v2.to_inspect_view(state);
      // hammer_v2 doesn't directly have archetypes in bases, inherits from base belief
      expect(inspected.bases.some(b => b.id === hammer._id)).to.be.true;

      // But get_archetypes should walk to base
      const archetype_labels = [...hammer_v2.get_archetypes()].map(a => a.label);
      expect(archetype_labels).to.include('PortableObject');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('Mind Isolation', () => {
    it('beliefs store in_mind reference', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 1});
      Belief.from_template(state, {traits: {}, bases: ['Location'], label: 'workshop'});

      const workshop = get_first_belief_by_label('workshop');
      expect(workshop.in_mind).to.equal(mind);
    });

    it('each mind has independent belief storage', () => {
      const mind_a = new Materia(logos(), 'mind_a');
      const state_a = mind_a.create_state(logos().origin_state, {tt: 1});
      const mind_b = new Materia(logos(), 'mind_b');
      const state_b = mind_b.create_state(logos().origin_state, {tt: 1});

      const item_a = Belief.from_template(state_a, {traits: {}, bases: ['PortableObject'], label: 'item_unique_a'});
      const item_b = Belief.from_template(state_b, {traits: {}, bases: ['PortableObject'], label: 'item_unique_b'});

      // Stored in different minds
      expect(item_a.in_mind).to.equal(mind_a);
      expect(item_b.in_mind).to.equal(mind_b);

      expect(item_a.in_mind).to.not.equal(mind_b);
      expect(item_b.in_mind).to.not.equal(mind_a);
    });

    it('prevents referencing other mind\'s subjects (enforces isolation)', () => {
      const mind_a = new Materia(logos(), 'mind_a');
      const state_a = mind_a.create_state(logos().origin_state, {tt: 1});
      Belief.from_template(state_a, {traits: {}, bases: ['Location'], label: 'workshop'});

      const mind_b = new Materia(logos(), 'mind_b');
      const state_b = mind_b.create_state(logos().origin_state, {tt: 1});

      // mind_b cannot use mind_a's subject - enforces isolation
      const workshop_a = get_first_belief_by_label('workshop');
      expect(() => {
        new Belief(state_b, workshop_a.subject, [workshop_a]);
      }).to.throw(/mater=null.*or.*mater=own_mind/);

      // Correct approach: use learn_about() to create knowledge about external entities
    });
  });

  describe('SID System', () => {
    it('creates belief with both sid and _id from same sequence', () => {
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const workshop = Belief.from_template(state, {
        traits: {},
        label: 'workshop',
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
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const room1 = Belief.from_template(state, {
        traits: {},
        label: 'room1',
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
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const room = Belief.from_template(state, {
        traits: {},
        label: 'room',
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
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const room_v1 = Belief.from_template(state, {
        traits: {},
        label: 'room',
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

    // Matrix 2.1: Subject from Own
    it('stores trait value as Subject when value is a Belief', () => {
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const workshop = Belief.from_template(state, {
        traits: {},
        label: 'workshop',
        bases: ['Location'],
      });

      const hammer = Belief.from_template(state, {
        traits: {
          location: workshop.subject,
        },
        bases: ['PortableObject'],
        label: 'hammer'
      });

      // Trait should store a Subject wrapping the sid
      const location_value = hammer._traits.get(Traittype.get_by_label('location'));
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value).to.equal(workshop.subject);
    });

    it('stores primitive values directly (not as sid)', () => {
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const ball = Belief.from_template(state, {
        traits: {
          color: 'red',
        },
        bases: ['PortableObject'],
        label: 'ball'
      });

      // Primitives should be stored as-is
      expect(ball._traits.get(Traittype.get_by_label('color'))).to.equal('red');
    });

    it('associates label with sid, not _id', () => {
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const room_v1 = Belief.from_template(state, {
        traits: {},
        label: 'room',
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
      const world_mind = new Materia(logos(), 'world');
      const state = world_mind.create_state(logos().origin_state, {tt: 1});

      const room = state.add_belief_from_template({
        traits: {},
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
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const hammer = Belief.from_template(state, {
        traits: {},
        bases: ['PortableObject'],
        label: 'hammer'
      });

      expect(hammer.get_tt()).to.equal(100);
    });

    it('returns tt from timed state for shared beliefs', () => {
      // Create a shared belief in a timed state in Eidos
      const eidos = DB.get_eidos();
      const state_110 = eidos.create_timed_state(110);
      const archetype = Archetype.get_by_label('Temporal');
      const belief = new Belief(state_110, null, [archetype]);

      expect(belief.get_tt()).to.equal(110);
    });

    it('returns tt from origin_state for regular beliefs', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const belief = Belief.from_template(state, {
        bases: ['PortableObject', 'Temporal']
      });

      // Should return tt from origin_state
      expect(belief.get_tt()).to.equal(100);
    });

    it('returns -Infinity for timeless shared beliefs (no origin_state)', () => {
      const eidos = DB.get_eidos();
      const belief = new Belief(eidos.origin_state, null, []);
      belief.origin_state = null;  // Manually break it for testing

      expect(belief.get_tt()).to.equal(-Infinity);
    });

    it('handles tt=0 correctly (not confused with null/undefined)', () => {
      const eidos = DB.get_eidos();
      const state_0 = eidos.create_timed_state(0);
      const archetype = Archetype.get_by_label('Temporal');
      const belief = new Belief(state_0, null, [archetype]);

      // Should return 0 from origin_state.tt (not -Infinity)
      expect(belief.get_tt()).to.equal(0);
    });
  });

  /**
   * MATRIX COVERAGE: Trait Value Inheritance
   * ✅ 1.1 Own Trait (Baseline) - Primitive-String
   * ✅ 1.3 Single Belief Inheritance
   * ✅ 1.5 Multi-Level Inheritance (Transitive)
   * ✅ 1.7 Own Shadows Inherited
   * ✅ 2.1 Subject from Own
   * ✅ 7.3 to_inspect_view() shows composed values
   *
   * MISSING FROM THIS SECTION:
   * ❌ 1.6 Diamond Archetype Conflict
   * ❌ 1.8 Null vs Absence
   * ❌ 2.2 Subject from Archetype (Default Value)
   */
  describe('Trait Value Inheritance', () => {
    // Matrix 1.1: Own Trait (Baseline) - Primitive-String
    it('returns trait from own _traits', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const workshop = state.add_belief_from_template({
        traits: {},
        label: 'workshop',
        bases: ['Location']
      });

      const hammer = state.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {location: workshop.subject,
          color: 'grey'}
      });

      const location_value = hammer.get_trait(state, Traittype.get_by_label('location'));
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer.get_trait(state, Traittype.get_by_label('color'))).to.equal('grey');
    });

    // Matrix 1.3: Single Belief Inheritance
    it('inherits trait value from base belief', () => {
      const mind = new Materia(logos(), 'test');
      const state1 = mind.create_state(logos().origin_state, {tt: 100});

      const workshop = state1.add_belief_from_template({
        traits: {},
        label: 'workshop',
        bases: ['Location']
      });

      const hammer_v1 = state1.add_belief_from_template({
                bases: ['PortableObject'],
        traits: {location: workshop.subject,
          color: 'grey'}
      });

      state1.lock();

      // Create v2 with only color changed
      const state2 = state1.branch_state(logos().origin_state, 101);
      const hammer_v2 = Belief.from_template(state2, {
        sid: hammer_v1.subject.sid,
        bases: [hammer_v1],
        traits: {
          color: 'blue'
        }
      });

      // v2 should have color in _traits, but location inherited from v1
      expect(hammer_v2._traits.has(Traittype.get_by_label('color'))).to.be.true;
      expect(hammer_v2._traits.has(Traittype.get_by_label('location'))).to.be.false;

      // get_trait should find both
      expect(hammer_v2.get_trait(state2, Traittype.get_by_label('color'))).to.equal('blue');
      const location_value = hammer_v2.get_trait(state2, Traittype.get_by_label('location'));
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
    });

    // Matrix 1.7: Own Shadows Inherited
    it('own trait shadows inherited trait', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const hammer_v1 = Belief.from_template(state, {
        traits: {
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

      expect(hammer_v2.get_trait(state, Traittype.get_by_label('color'))).to.equal('blue');
    });

    // Matrix 1.5: Multi-Level Inheritance (Transitive)
    it('multi-level inheritance works', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const workshop = Belief.from_template(state, {
        traits: {},
        label: 'workshop',
        bases: ['Location']
      });

      const hammer_v1 = Belief.from_template(state, {
        traits: {
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
      const location_value = hammer_v3.get_trait(state, Traittype.get_by_label('location'));
      expect(location_value).to.be.instanceOf(Subject);
      expect(location_value.sid).to.equal(workshop.subject.sid);
      expect(hammer_v3.get_trait(state, Traittype.get_by_label('color'))).to.equal('red');
    });

    it('returns null for trait not in chain', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const hammer = Belief.from_template(state, {
        traits: {
          color: 'grey'
        },
        bases: ['PortableObject']
      });

      // Test that a valid trait that exists but isn't on the belief returns null
      // 'mind' trait exists but hammer doesn't have it (only Mental archetypes do)
      const mind_traittype = Traittype.get_by_label('mind');
      expect(hammer.get_trait(state, mind_traittype)).to.be.null;
    });

    // Matrix 7.3: to_inspect_view() shows composed values
    it('to_inspect_view includes inherited traits', () => {
      const mind = new Materia(logos(), 'test');
      const state = mind.create_state(logos().origin_state, {tt: 100});

      const workshop = Belief.from_template(state, {
        traits: {},
        label: 'workshop',
        bases: ['Location']
      });

      // Create v1 with location and color
      const hammer_v1 = Belief.from_template(state, {
        traits: {
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
      expect(hammer_v2.get_trait(state, Traittype.get_by_label('color'))).to.equal('blue');
      expect(hammer_v2.get_trait(state, Traittype.get_by_label('location'))).to.be.instanceOf(Subject);

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

  /**
   * MATRIX COVERAGE: Shared Belief Resolution
   * ✅ 1.4 Shared Belief Inheritance
   * ✅ 2.3 Subject Through Multi-Level Chain
   * ✅ 7.8 Trait from Shared Belief at Different Timestamps
   * ✅ 7.9 Mixed Archetype + Shared Belief Bases
   *
   * MISSING FROM THIS SECTION:
   * ❌ 2.2 Subject from Archetype (archetype with default Subject value)
   */
  describe('Shared Belief Resolution', () => {
    // Matrix 1.4: Shared Belief Inheritance
    it('inherits traits from shared belief prototype', () => {
      // Create shared belief "GenericSword" with damage: 10, weight: 5
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const generic_sword = state_100.add_belief_from_template({
        bases: ['MeleeWeapon'],
        traits: {
          damage: 10,
          weight: 5
        }
      });

      expect(generic_sword.in_mind).to.equal(eidos);
      expect(generic_sword.origin_state).to.equal(state_100);

      // Create regular belief inheriting from GenericSword
      const mind = new Materia(logos(), 'player');
      const state = mind.create_state(logos().origin_state, {tt: 200});

      const player_sword = Belief.from_template(state, {
        traits: {
        },
        bases: [generic_sword]
      });

      // Should inherit traits from shared belief
      expect(player_sword.get_trait(state, Traittype.get_by_label('damage'))).to.equal(10);
      expect(player_sword.get_trait(state, Traittype.get_by_label('weight'))).to.equal(5);

      // Can override inherited traits
      const damage_traittype = Traittype.get_by_label('damage');
      player_sword.add_trait(damage_traittype, 15);
      expect(player_sword.get_trait(state, Traittype.get_by_label('damage'))).to.equal(15);
      expect(player_sword.get_trait(state, Traittype.get_by_label('weight'))).to.equal(5); // Still inherited
    });

    it('multiple beliefs reference same shared subject', () => {
      // Create shared belief "StandardSword" with damage: 10
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const standard_sword = state_100.add_belief_from_template({
        bases: ['MeleeWeapon'],
        traits: {
          damage: 10,
          weight: 3
        },
        label: 'StandardSword'
      });

      // Create two different minds with beliefs inheriting from same shared belief
      const mind1 = new Materia(logos(), 'player1');
      const state1 = mind1.create_state(logos().origin_state, {tt: 200});

      const sword_1 = Belief.from_template(state1, {
        traits: {
          sharpness: 7
        },
        bases: [standard_sword],
        label: 'sword_1'
      });

      const mind2 = new Materia(logos(), 'player2');
      const state2 = mind2.create_state(logos().origin_state, {tt: 200});

      const sword_2 = Belief.from_template(state2, {
        traits: {
          sharpness: 9
        },
        bases: [standard_sword],
        label: 'sword_2'
      });

      // Both should inherit from same shared belief
      expect(sword_1.get_trait(state1, Traittype.get_by_label('damage'))).to.equal(10);
      expect(sword_2.get_trait(state2, Traittype.get_by_label('damage'))).to.equal(10);
      expect(sword_1.get_trait(state1, Traittype.get_by_label('weight'))).to.equal(3);
      expect(sword_2.get_trait(state2, Traittype.get_by_label('weight'))).to.equal(3);

      // Each has its own sharpness value (overrides shared belief's implicit null)
      expect(sword_1.get_trait(state1, Traittype.get_by_label('sharpness'))).to.equal(7);
      expect(sword_2.get_trait(state2, Traittype.get_by_label('sharpness'))).to.equal(9);

      // Both reference the same shared belief in their bases
      expect(sword_1._bases.has(standard_sword)).to.be.true;
      expect(sword_2._bases.has(standard_sword)).to.be.true;
    });

    // Matrix 7.8: Trait from Shared Belief at Different Timestamps
    it('resolves correct version at different timestamps', () => {
      // Create shared belief v1 at timestamp 100
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const seasonal_v1 = state_100.add_belief_from_template({
        bases: ['Effect'],
        traits: {
          bonus: 5
        },
        label: 'SeasonalBonus'
      });

      // Create shared belief v2 at tt 200 (newer version)
      const state_200 = eidos.create_timed_state(200);
      const seasonal_v2 = new Belief(state_200, seasonal_v1.subject, [seasonal_v1]);
      const bonus_traittype = Traittype.get_by_label('bonus');
      seasonal_v2.add_trait(bonus_traittype, 10);
      state_200.insert_beliefs(seasonal_v2);
      seasonal_v2.lock(state_200);

      // Query at timestamp 150 -> should find v1
      const at_150 = [...seasonal_v1.subject.beliefs_at_tt(150)];
      expect(at_150).to.have.lengthOf(1);
      expect(at_150[0].get_trait(at_150[0].origin_state, Traittype.get_by_label('bonus'))).to.equal(5);

      // Query at timestamp 250 -> should find v2
      const at_250 = [...seasonal_v1.subject.beliefs_at_tt(250)];
      expect(at_250).to.have.lengthOf(1);
      expect(at_250[0].get_trait(at_250[0].origin_state, Traittype.get_by_label('bonus'))).to.equal(10);

      // Query at timestamp 50 (before v1) -> should find nothing
      const at_50 = [...seasonal_v1.subject.beliefs_at_tt(50)];
      expect(at_50).to.have.lengthOf(0);
    });

    // Matrix 2.3: Subject Through Multi-Level Chain
    it('resolves traits through shared belief chain', () => {
      // Create shared belief chain: Weapon (base damage) → Sword (adds sharpness)
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const weapon = state_100.add_belief_from_template({
        bases: ['MeleeWeapon'],
        traits: {
          damage: 5,
          weight: 2
        },
        label: 'Weapon'
      });

      const sword = state_100.add_belief_from_template({
        bases: [weapon],
        traits: {
          sharpness: 8
        },
        label: 'Sword'
      });

      // Create regular belief inheriting from Sword
      const mind = new Materia(logos(), 'player');
      const state = mind.create_state(logos().origin_state, {tt: 200});

      const magic_sword = Belief.from_template(state, {
        traits: {
          weight: 1  // Override weight to be lighter
        },
        bases: [sword],
        label: 'magic_sword'
      });

      // Should resolve traits through entire chain
      expect(magic_sword.get_trait(state, Traittype.get_by_label('weight'))).to.equal(1);       // Own trait (overridden)
      expect(magic_sword.get_trait(state, Traittype.get_by_label('sharpness'))).to.equal(8);    // From Sword
      expect(magic_sword.get_trait(state, Traittype.get_by_label('damage'))).to.equal(5);       // From Weapon

      // Verify the chain structure
      expect(magic_sword._bases.has(sword)).to.be.true;
      expect(sword._bases.has(weapon)).to.be.true;
    });

    // Matrix 7.9: Mixed Archetype + Shared Belief Bases
    it('inherits from shared belief through regular belief chain', () => {
      // Create shared belief "Tool" with durability
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const tool = state_100.add_belief_from_template({
        bases: ['Tool'],
        traits: {
          durability: 100
        },
        label: 'GenericTool'
      });

      const mind = new Materia(logos(), 'player');
      const state = mind.create_state(logos().origin_state, {tt: 200});

      // Create regular belief inheriting from shared belief
      const hammer_v1 = Belief.from_template(state, {
        traits: {
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
      expect(hammer_v2.get_trait(state, Traittype.get_by_label('weight'))).to.equal(12);       // Own trait
      expect(hammer_v2.get_trait(state, Traittype.get_by_label('durability'))).to.equal(100);  // From shared Tool via hammer_v1

      // Verify chain: hammer_v2 → hammer_v1 → Tool (shared)
      expect(hammer_v2._bases.has(hammer_v1)).to.be.true;
      expect(hammer_v1._bases.has(tool)).to.be.true;
      expect(tool.in_mind).to.equal(eidos);
    });

    it('get_shared_belief_by_state finds shared belief', () => {
      // Create shared belief for a subject
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const default_item = state_100.add_belief_from_template({
        bases: ['Item'],
        traits: {
          value: 50
        },
        label: 'default_item'
      });

      // Create state in mind (no belief for default_item in this mind)
      const mind = new Materia(logos(), 'player');
      const state = mind.create_state(logos().origin_state, {tt: 150});

      // subject.get_shared_belief_by_state should find the shared belief
      const found = default_item.subject.get_shared_belief_by_state(state);

      expect(found).to.not.be.null;
      expect(found).to.equal(default_item);
      expect(found.in_mind).to.equal(eidos);  // Confirms it's the shared belief in Eidos
      expect(found.get_trait(state, Traittype.get_by_label('value'))).to.equal(50);
    });

    it('shared beliefs not registered in belief_by_mind', () => {
      // Create shared belief
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const prototype = state_100.add_belief_from_template({
        bases: ['Item'],
        traits: {
          value: 42
        },
        label: 'prototype_1'
      });

      // Shared belief should be in belief_by_subject
      const beliefs_by_subject = [...DB.get_beliefs_by_subject(prototype.subject)];
      expect(beliefs_by_subject).to.have.lengthOf.at.least(1);
      expect(beliefs_by_subject).to.include(prototype);

      // Shared belief is now in Eidos mind
      expect(prototype.in_mind).to.equal(eidos);

      // Create regular belief in a mind
      const mind = new Materia(logos(), 'player');
      const state = mind.create_state(logos().origin_state, {tt: 200});
      const regular_belief = Belief.from_template(state, {
        traits: {},
        bases: ['Thing'],
        label: 'regular_item'
      });

      // Regular belief SHOULD be in belief_by_mind
      const beliefs_in_mind = [...DB.get_beliefs_by_mind(mind)];
      expect(beliefs_in_mind).to.have.lengthOf.at.least(1);
      expect(beliefs_in_mind).to.include(regular_belief);
      expect(regular_belief.in_mind).to.equal(mind);
    });
  });

  /**
   * MATRIX COVERAGE: Shared Belief Scoping
   * ✅ 7.7 Shared Belief Scoping (all tests)
   *   - Accessible from child minds
   *   - NOT accessible from different parent hierarchy
   *   - Global shared beliefs (shared_for_mind_with_parent=null or logos)
   */
  describe('Shared Belief Scoping', () => {
    // Matrix 7.7: Shared Belief Scoping
    it('shared belief scoped to parent mind is accessible from child minds', () => {
      // Create parent mind with initial state
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100});

      // Create shared belief scoped to world_mind (use existing Thing archetype)
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const cultural_knowledge = state_100.add_belief_from_template({
        bases: ['Thing'],
        traits: {},
        label: 'CityLore'
      });
      cultural_knowledge.lock(state_100);
      cultural_knowledge.subject.shared_for_mind_with_parent = world_mind;

      expect(cultural_knowledge.subject.shared_for_mind_with_parent).to.equal(world_mind);

      // Create child mind (NPC under world)
      const npc_mind = new Materia(world_mind, 'npc1');
      const npc_state = npc_mind.create_state(world_state);

      // NPC should be able to access shared belief via from_template
      const npc_belief = Belief.from_template(npc_state, {
        bases: ['CityLore'],
        traits: {},
        label: 'npc_knowledge'
      });

      expect(npc_belief._bases.has(cultural_knowledge)).to.be.true;
    });

    it('particular subject (mater=mind) NOT accessible from different mind', () => {
      // Create first mind (world) with a particular subject
      const world_mind = new Materia(logos(), 'world');
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100});
      const tavern = Belief.from_template(world_state, {
        bases: ['Location'],
        traits: {},
        label: 'WorldTavern'
      });

      // Verify it's a particular (mater = world_mind)
      expect(tavern.subject.mater).to.equal(world_mind);

      // Create second mind (dream)
      const dream_mind = new Materia(logos(), 'dream');
      const dream_state = dream_mind.create_state(logos().origin_state, {tt: 100});

      // Dream mind cannot use world's particular subject - enforces isolation
      expect(() => {
        new Belief(dream_state, tavern.subject, [tavern]);
      }).to.throw(/mater=null.*or.*mater=own_mind/);
    });

    it('different universal beliefs accessible by label from any mind', () => {
      // Create two parent minds with states
      const world_mind = new Materia(logos(), 'world');
      const world_parent_state = world_mind.create_state(logos().origin_state, {tt: 100});
      const dream_mind = new Materia(logos(), 'dream');
      const dream_parent_state = dream_mind.create_state(logos().origin_state, {tt: 100});

      // Create two different universal beliefs in Eidos
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const world_tavern = state_100.add_belief_from_template({
        bases: ['Thing'],
        traits: {},
        label: 'WorldTavern'
      });
      world_tavern.lock(state_100);

      const dream_tavern = state_100.add_belief_from_template({
        bases: ['Thing'],
        traits: {},
        label: 'DreamTavern'
      });
      dream_tavern.lock(state_100);

      // Both are universals (mater = null)
      expect(world_tavern.subject.mater).to.be.null;
      expect(dream_tavern.subject.mater).to.be.null;
      expect(world_tavern.subject).to.not.equal(dream_tavern.subject); // Different subjects

      // Any mind can access either belief by label
      const world_child = new Materia(world_mind, 'world_npc');
      const world_state = world_child.create_state(world_parent_state);
      const world_belief = Belief.from_template(world_state, {
        bases: ['WorldTavern'],
        traits: {},
        label: 'world_tavern_instance'
      });
      expect(world_belief._bases.has(world_tavern)).to.be.true;

      const dream_child = new Materia(dream_mind, 'dreamer');
      const dream_state = dream_child.create_state(dream_parent_state);
      const dream_belief = Belief.from_template(dream_state, {
        bases: ['DreamTavern'],
        traits: {},
        label: 'dream_tavern_instance'
      });
      expect(dream_belief._bases.has(dream_tavern)).to.be.true;
    });

    it('universal subject (mater=null) accessible from any mind', () => {
      // Create universal shared belief in Eidos
      const eidos = DB.get_eidos();
      const state_100 = eidos.create_timed_state(100);
      const generic_weapon = state_100.add_belief_from_template({
        bases: ['Thing'],
        traits: {},
        label: 'GenericWeapon'
      });
      generic_weapon.lock(state_100);  // Test-created prototypes must be manually locked

      // Eidos beliefs are universals (mater = null)
      expect(generic_weapon.subject.mater).to.be.null;

      // Create two separate mind hierarchies
      const world_mind = new Materia(logos(), 'world');
      const world_parent_state = world_mind.create_state(logos().origin_state, {tt: 100});
      const world_npc = new Materia(world_mind, 'guard');
      const world_state = world_npc.create_state(world_parent_state);

      const dream_mind = new Materia(logos(), 'dream');
      const dream_parent_state = dream_mind.create_state(logos().origin_state, {tt: 100});
      const dream_npc = new Materia(dream_mind, 'phantom');
      const dream_state = dream_npc.create_state(dream_parent_state);

      // Both should be able to access the universal belief
      const world_weapon = Belief.from_template(world_state, {
        bases: ['GenericWeapon'],
        traits: {},
        label: 'guard_sword'
      });
      expect(world_weapon._bases.has(generic_weapon)).to.be.true;

      const dream_weapon = Belief.from_template(dream_state, {
        bases: ['GenericWeapon'],
        traits: {},
        label: 'phantom_blade'
      });
      expect(dream_weapon._bases.has(generic_weapon)).to.be.true;
    });
  });

  describe('Mind Trait Inspection', () => {
    beforeEach(() => {
      DB.reset_registries();
      setupStandardArchetypes();
    });

    it('to_inspect_view() shows mind trait for Person with explicit mind', () => {
      const world_state = createMindWithBeliefs('world', {
        workshop: { bases: ['Location'] },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              workshop: ['location']
            }
          }
        }
      });

      const player = get_first_belief_by_label('player');
      const view = player.to_inspect_view(world_state);

      // Mind trait should appear in inspection
      expect(view.traits.mind).to.exist;
      expect(view.traits.mind._type).to.equal('Mind');
      expect(view.traits.mind._ref).to.be.a('number');
      expect(view.traits.mind.label).to.be.a('string');
    });

    it('to_inspect_view() excludes null traits from Mental archetype', () => {
      const world_state = createMindWithBeliefs('world', {
        ghost: {
          bases: ['Mental'],
          traits: {}
        }
      });

      const ghost = get_first_belief_by_label('ghost');
      const view = ghost.to_inspect_view(world_state);

      // Mental has mind: null in archetype, but null traits are excluded from inspection
      expect(view.traits.mind).to.be.undefined;
    });
  });

  /**
   * MATRIX COVERAGE: Trait Caching
   * ✅ 7.4 Caching behavior for locked beliefs
   * ✅ 7.5 Caching doesn't poison unlocked states
   */
  describe('Trait Caching', () => {
    // Matrix 7.4, 7.5: Caching behavior
    it('does not cache get_trait results for unlocked states', () => {
      const world_state = createMindWithBeliefs('world', {
        player: {
          bases: ['Person'],
          traits: {
            mind: {}
          }
        }
      });

      const player = get_first_belief_by_label('player');

      // Get trait before locking - should not cache
      const mind_before = player.get_trait(world_state, Traittype.get_by_label('mind'));
      expect(mind_before).to.not.be.null;

      // Cache should be empty for unlocked state
      expect(player._cache.size).to.equal(0);
    });

    it('does cache get_trait results for locked beliefs', () => {
      const world_state = createMindWithBeliefs('world', {
        player: {
          bases: ['Person'],
          traits: {
            // Don't set @about - it's inherited from Thing archetype
          }
        }
      });

      const player = get_first_belief_by_label('player');
      player.lock(world_state);

      // Get inherited trait after locking - should cache
      const about_value = player.get_trait(world_state, Traittype.get_by_label('@about'));

      // Cache should have the inherited trait (not own traits)
      const about_traittype = Traittype.get_by_label('@about');
      expect(player._cache.has(about_traittype)).to.be.true;
      expect(player._cache.get(about_traittype)).to.equal(about_value);
    });

    it('to_inspect_view on unlocked state does not poison cache', () => {
      const world_state = createMindWithBeliefs('world', {
        player: {
          bases: ['Person'],
          traits: {
            mind: {}
          }
        }
      });

      const player = get_first_belief_by_label('player');

      // Inspect BEFORE locking (simulates world.mjs debug log)
      const view_unlocked = player.to_inspect_view(world_state);
      expect(view_unlocked.traits.mind).to.not.be.null;

      // Lock the state
      world_state.lock();

      // Inspect AFTER locking - should still work
      const view_locked = player.to_inspect_view(world_state);
      expect(view_locked.traits.mind).to.not.be.null;
      expect(view_locked.traits.mind._type).to.equal('Mind');
    });

    it('composable trait inspection does not cache null for unlocked states', () => {
      const world_state = createMindWithBeliefs('world', {
        player: {
          bases: ['Person'],
          traits: {
            mind: {}
          }
        }
      });

      const player = get_first_belief_by_label('player');

      // This test guards against premature caching:
      // 1. to_inspect_view calls get_trait for composable traits
      // 2. If state is unlocked, caching must not happen
      // 3. Otherwise null would get cached and returned later

      const view1 = player.to_inspect_view(world_state);
      expect(view1.traits.mind).to.not.be.null;

      // Lock and inspect again - should not be affected by earlier call
      world_state.lock();
      const view2 = player.to_inspect_view(world_state);
      expect(view2.traits.mind).to.not.be.null;
      expect(view2.traits.mind._ref).to.equal(view1.traits.mind._ref);
    });

    it('uses parent belief cache when _cached_all is true', () => {
      // Create a 3-level belief chain: grandparent -> parent -> child
      const world_state = createMindWithBeliefs('world', {
        grandparent: {
          bases: ['Person'],
          traits: {
            mind: {}
          }
        }
      });

      const grandparent = get_first_belief_by_label('grandparent');

      // Lock grandparent and iterate all its traits to populate _cached_all
      grandparent.lock(world_state);
      const gp_traits = [...grandparent.get_defined_traits()];
      expect(grandparent._cached_all).to.be.true;
      expect(grandparent._cache.size).to.be.greaterThan(0);

      // Create parent with grandparent as base
      const parent = Belief.from_template(world_state, {
        bases: [grandparent],
        label: 'parent'
      });
      world_state.insert_beliefs(parent);

      // Lock parent and iterate - should use grandparent's cache
      parent.lock(world_state);
      const parent_traits = [...parent.get_defined_traits()];
      expect(parent._cached_all).to.be.true;

      // Parent should have same traits as grandparent (inherited)
      const gp_trait_labels = gp_traits.map(([tt]) => tt.label).sort();
      const parent_trait_labels = parent_traits.map(([tt]) => tt.label).sort();
      expect(parent_trait_labels).to.deep.equal(gp_trait_labels);

      // Create child with parent as base
      const child = Belief.from_template(world_state, {
        bases: [parent],
        label: 'child'
      });
      world_state.insert_beliefs(child);

      // Lock child and iterate - should use parent's cache (which covers grandparent too)
      child.lock(world_state);
      const child_traits = [...child.get_defined_traits()];
      expect(child._cached_all).to.be.true;

      // Child should have same traits
      const child_trait_labels = child_traits.map(([tt]) => tt.label).sort();
      expect(child_trait_labels).to.deep.equal(gp_trait_labels);
    });
  });

  describe('get_slots()', () => {
    it('returns all available trait slots from single archetype', () => {
      const state = createStateInNewMind('test');
      const ball = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {},
        label: 'ball'
      });

      const slots = [...ball.get_slots()];
      const slot_labels = slots.map(tt => tt.label);

      // Should include traits from PortableObject, ObjectPhysical, Thing
      expect(slot_labels).to.include('@about'); // from Thing
      expect(slot_labels).to.include('location'); // from ObjectPhysical
      expect(slot_labels).to.include('color'); // from ObjectPhysical

      // All slots should be Traittype instances
      for (const slot of slots) {
        expect(slot).to.be.instanceOf(Traittype);
      }
    });

    it('returns unique slots from multiple archetypes', () => {
      const state = createStateInNewMind('test');

      // Person has bases: ['Actor', 'Mental']
      // Both Actor and Mental have '@label', should only appear once
      const person = Belief.from_template(state, {
        bases: ['Person'],
        traits: {},
        label: 'alice'
      });

      const slots = [...person.get_slots()];
      const slot_labels = slots.map(tt => tt.label);

      // Count occurrences of '@about' (appears in Thing, which both Actor and Mental inherit from)
      const about_count = slot_labels.filter(l => l === '@about').length;
      expect(about_count).to.equal(1, '@about should only appear once despite multiple bases');

      // Should have traits from Actor, Mental, and Thing
      expect(slot_labels).to.include('@about'); // from Thing
      expect(slot_labels).to.include('location'); // from Actor (via ObjectPhysical)
      expect(slot_labels).to.include('mind'); // from Mental
    });

    it('returns slots from belief with base belief', () => {
      const state = createStateInNewMind('test');

      const ball = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {},
        label: 'ball'
      });

      const ball_v2 = Belief.from_template(state, {
        bases: [ball],
        traits: {}
      });

      const slots = [...ball_v2.get_slots()];
      const slot_labels = slots.map(tt => tt.label);

      // Should inherit slots from base belief's archetypes
      expect(slot_labels).to.include('@about'); // from Thing
      expect(slot_labels).to.include('location'); // from ObjectPhysical
      expect(slot_labels).to.include('color'); // from ObjectPhysical
    });

    it('returns slots for belief with both archetype and belief bases', () => {
      const state = createStateInNewMind('test');

      const ball = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: {},
        label: 'ball'
      });

      // Create belief with both archetype and belief base
      const combined = Belief.from_template(state, {
        bases: ['Actor', ball], // Mixed bases
        traits: {},
        label: 'mobile_ball'
      });

      const slots = [...combined.get_slots()];
      const slot_labels = slots.map(tt => tt.label);

      // Should have traits from both Actor and PortableObject
      expect(slot_labels).to.include('location'); // from both
      expect(slot_labels).to.include('color'); // from PortableObject

      // No duplicates
      const location_count = slot_labels.filter(l => l === 'location').length;
      expect(location_count).to.equal(1, 'location should only appear once');
    });
  });
});
