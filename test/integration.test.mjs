import { expect } from 'chai';
import { Mind, State, Belief, Archetype, Traittype, save_mind, load } from '../public/worker/cosmos.mjs';
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

      const world_state = createMindWithBeliefs('world', world_belief);
      const world_mind = world_state.in_mind;

      let ball = world_state.add_belief({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      ball = Belief.from_template(ball.in_mind, {
        bases: [ball],
        traits: { color: 'blue' }
      });

      // Verify ball structure
      const ball_inspected = ball.inspect(world_state);
      expect(ball_inspected.traits.color).to.equal('blue');
      expect([...ball.get_archetypes()].map(a => a.label)).to.include('PortableObject');

      // Verify player
      let player = DB.get_belief_by_label('player');
      const player_mind = new Mind('player_mind');
      const player_mind_state = player_mind.create_state(1);
      player = Belief.from_template(player.in_mind, {
        bases: [player],
        traits: { mind_states: [player_mind_state] }
      });

      const player_inspected = player.inspect(world_state);
      expect(player_inspected.traits.mind_states[0]._ref).to.equal(player_mind_state._id);

      // Verify learn_about
      const workshop = DB.get_belief_by_label('workshop');
      const workshop_knowledge = player_mind_state.learn_about(world_state, workshop);

      const workshop_inspected = workshop_knowledge.inspect(player_mind_state);
      expect(workshop_inspected.traits['@about']._ref).to.equal(workshop._id);
      expect(workshop_inspected.archetypes).to.include('Location');
    });
  });
});
