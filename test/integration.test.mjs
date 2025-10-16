import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';
import { createMindWithBeliefs, setupStandardArchetypes } from './helpers.mjs';

describe('Integration', () => {
  beforeEach(() => {
    DB.reset_registries();
    setupStandardArchetypes();
  });

  describe('Complex Scenarios from world.mjs', () => {
    it('recreates world.mjs setup and verifies structure', () => {
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
          },
        },
      }

      const world_mind = createMindWithBeliefs('world', world_belief);
      const state = world_mind.create_state(1);
      const world_beliefs = [...DB.Belief.by_id.values()].filter(b => b.in_mind === world_mind);
      state.insert.push(...world_beliefs);

      let ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      ball = new DB.Belief(ball.in_mind, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      // Verify ball structure
      const ball_inspected = ball.inspect();
      expect(ball_inspected.traits.color).to.equal('blue');
      expect([...ball.get_archetypes()].map(a => a.label)).to.include('PortableObject');

      // Verify player
      let player = DB.Belief.by_label.get('player');
      const player_mind = new DB.Mind('player_mind');
      const player_mind_state = player_mind.create_state(1);
      player = new DB.Belief(player.in_mind, {
        bases: [player],
        traits: { mind_states: [player_mind_state] }
      });

      const player_inspected = player.inspect();
      expect(player_inspected.traits.mind_states[0]._ref).to.equal(player_mind_state._id);

      // Verify learn_about
      const workshop = DB.Belief.by_label.get('workshop');
      const workshop_knowledge = player_mind_state.learn_about(workshop);

      const workshop_inspected = workshop_knowledge.inspect();
      expect(workshop_inspected.about._ref).to.equal(workshop._id);
      expect(workshop_inspected.archetypes).to.include('Location');
    });
  });
});
