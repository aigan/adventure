import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupMinimalArchetypes } from './helpers.mjs';

describe('State', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupMinimalArchetypes();
  });

  describe('Iteration Patterns', () => {
    it('mind.belief Set contains all beliefs for that mind', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject']
      });

      expect([...DB.Belief.by_id.values()].filter(b => b.in_mind === mind).length).to.equal(2);
      expect([...DB.Belief.by_id.values()].some(b => b.in_mind === mind && b === DB.Belief.by_label.get('workshop'))).to.be.true;
      expect([...DB.Belief.by_id.values()].some(b => b.in_mind === mind && b === hammer)).to.be.true;
    });

    it('can iterate over beliefs for a mind', () => {
      const mind = createMindWithBeliefs('test', {
        workshop: { bases: ['Location'] },
        hammer: { bases: ['PortableObject'] }
      });

      const labels = [];
      for (const belief of DB.Belief.by_id.values()) {
        if (belief.in_mind === mind) {
          labels.push(belief.label);
        }
      }

      expect(labels).to.have.members(['workshop', 'hammer']);
    });

    it('mind.belief_by_label provides fast label lookup', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'workshop', bases: ['Location']});

      expect(DB.Belief.by_label.get('workshop')).to.exist;
      expect(DB.Belief.by_label.get('workshop').label).to.equal('workshop');
    });
  });

  describe('Cross-Mind Visibility', () => {
    it('state.get_beliefs only returns beliefs from that state\'s mind', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'item_a', bases: ['PortableObject']});
      const state_a = mind_a.create_state(1);
      const beliefs_for_a = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_for_a);

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'item_b', bases: ['PortableObject']});
      const state_b = mind_b.create_state(1);
      const beliefs_for_b = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_for_b);

      const beliefs_a = [...state_a.get_beliefs()];
      const beliefs_b = [...state_b.get_beliefs()];

      expect(beliefs_a).to.have.lengthOf(1);
      expect(beliefs_a[0].label).to.equal('item_a');

      expect(beliefs_b).to.have.lengthOf(1);
      expect(beliefs_b[0].label).to.equal('item_b');
    });

    it('beliefs from different minds don\'t mix in states', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'workshop_a', bases: ['Location']});

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'workshop_b', bases: ['Location']});

      const state_a = mind_a.create_state(1);
      const beliefs_a = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_a);
      state_a.insert.push(...beliefs_a);
      const state_b = mind_b.create_state(1);
      const beliefs_b = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind_b);
      state_b.insert.push(...beliefs_b);

      const labels_a = [...state_a.get_beliefs()].map(b => b.label);
      const labels_b = [...state_b.get_beliefs()].map(b => b.label);

      expect(labels_a).to.deep.equal(['workshop_a']);
      expect(labels_b).to.deep.equal(['workshop_b']);
    });
  });

  describe('State Operations', () => {
    it('state.tick with replace removes correct belief', () => {
      const mind = new DB.Mind('test');
      mind.add({label: 'hammer_v1', bases: ['PortableObject']});

      const state1 = mind.create_state(1);
      const hammer_v1 = DB.Belief.by_label.get('hammer_v1');
      const hammer_v2 = hammer_v1.with_traits({ color: 'red' });

      const state2 = state1.tick({ replace: [hammer_v2] });

      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(1);
      expect(beliefs[0]).to.equal(hammer_v2);
      expect(beliefs[0].traits.get('color')).to.equal('red');
    });

    it('multiple minds can have states without interference', () => {
      const mind_a = new DB.Mind('mind_a');
      mind_a.add({label: 'item_in_a', bases: ['PortableObject']});
      const state_a1 = mind_a.create_state(1);

      const mind_b = new DB.Mind('mind_b');
      mind_b.add({label: 'item_in_b', bases: ['PortableObject']});
      const state_b1 = mind_b.create_state(1);

      // Add different beliefs to each mind
      const item_a = DB.Belief.by_label.get('item_in_a');
      const item_a2 = item_a.with_traits({ color: 'red' });
      const state_a2 = state_a1.tick({ replace: [item_a2] });

      const item_b = DB.Belief.by_label.get('item_in_b');
      const item_b2 = item_b.with_traits({ color: 'blue' });
      const state_b2 = state_b1.tick({ replace: [item_b2] });

      // Verify states are independent
      const beliefs_a = [...state_a2.get_beliefs()];
      const beliefs_b = [...state_b2.get_beliefs()];

      expect(beliefs_a[0].traits.get('color')).to.equal('red');
      expect(beliefs_b[0].traits.get('color')).to.equal('blue');
    });

    it('state inheritance chain works correctly', () => {
      const mind = createMindWithBeliefs('test', {
        item1: { bases: ['PortableObject'] },
        item2: { bases: ['PortableObject'] }
      });

      const state1 = mind.create_state(1);
      const initial_beliefs = [...DB.Belief.by_id.values()].filter(b => b.in_mind === mind);
      state1.insert.push(...initial_beliefs);
      const item3 = mind.add({ label: 'item3', bases: ['PortableObject'] });
      const state2 = state1.tick({ insert: [item3] });

      // state2 should have all three items
      const beliefs = [...state2.get_beliefs()];
      expect(beliefs).to.have.lengthOf(3);

      const labels = beliefs.map(b => b.label).sort();
      expect(labels).to.deep.equal(['item1', 'item2', 'item3']);
    });
  });
});
