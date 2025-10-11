import { expect } from 'chai';
import * as DB from '../public/worker/db.mjs';

describe('Mind', () => {
  it('creates mind with unique ID', () => {
    const mind = new DB.Mind('test_mind', {});
    expect(mind._id).to.be.a('number');
    expect(mind.label).to.equal('test_mind');
  });

  it('registers mind by id and label', () => {
    const mind = new DB.Mind('registered', {});
    expect(DB.Mind.get_by_id(mind._id)).to.equal(mind);
    expect(DB.Mind.get_by_label('registered')).to.equal(mind);
  });
});

describe('Archetypes', () => {
  beforeEach(() => {
    // Setup archetypes like world.mjs
    const traittypes = {
      location: 'Location',
      mind: 'Mind',
      color: 'string',
    }

    const archetypes = {
      ObjectPhysical: {
        traits: {
          location: null,
          color: null,
        },
      },
      Mental: {
        traits: {
          mind: null,
        },
      },
      Location: {
        bases: ['ObjectPhysical'],
      },
      PortableObject: {
        bases: ['ObjectPhysical'],
      },
      Actor: {
        bases: ['ObjectPhysical'],
      },
      Player: {
        bases: ['Actor', 'Mental'],
      },
    }

    DB.register(archetypes, traittypes);
  });

  describe('Archetype Composition', () => {
    it('single archetype has correct structure', () => {
      const mind = new DB.Mind('test', {});
      const workshop = mind.add({
        label: 'workshop',
        bases: ['Location']
      });

      const inspected = workshop.inspect();
      // Location inherits from ObjectPhysical, so we get both
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('archetype with base inherits traits from parent', () => {
      const mind = new DB.Mind('test', {});
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject'],
        traits: {
          color: 'black'
        }
      });

      // PortableObject → ObjectPhysical, so should have color trait
      expect(hammer.can_have_trait('color')).to.be.true;
      expect(hammer.can_have_trait('location')).to.be.true;
    });

    it('Player archetype inherits from multiple bases', () => {
      const mind = new DB.Mind('test', {});
      const player = mind.add({
        label: 'player',
        bases: ['Player']
      });

      const inspected = player.inspect();
      expect(inspected.archetypes).to.deep.equal(['Player', 'Actor', 'Mental', 'ObjectPhysical']);

      // Player → Actor → ObjectPhysical (has location, color)
      // Player → Mental (has mind)
      expect(player.can_have_trait('location')).to.be.true;
      expect(player.can_have_trait('mind')).to.be.true;
    });

    it('get_archetypes walks full inheritance chain', () => {
      const mind = new DB.Mind('test', {});
      const player = mind.add({
        label: 'player',
        bases: ['Player']
      });

      const archetype_labels = [...player.get_archetypes()].map(a => a.label);

      expect(archetype_labels).to.include('Player');
      expect(archetype_labels).to.include('Actor');
      expect(archetype_labels).to.include('Mental');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('Belief Versioning', () => {
    it('with_traits creates new belief with base reference', () => {
      const mind = new DB.Mind('test', {
        workshop: {
          bases: ['Location']
        }
      });

      const ball = mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop'
        }
      });

      const ball_v2 = ball.with_traits({
        color: 'blue'
      });

      const inspected = ball_v2.inspect();
      expect(inspected.bases).to.include(ball._id);
      expect(inspected.traits.color).to.equal('blue');

      // Should still have location from base
      expect(ball_v2.can_have_trait('location')).to.be.true;
    });

    it('versioned belief inherits archetypes from base', () => {
      const mind = new DB.Mind('test', {});
      const hammer = mind.add({
        label: 'hammer',
        bases: ['PortableObject']
      });

      const hammer_v2 = hammer.with_traits({
        color: 'black'
      });

      const inspected = hammer_v2.inspect();
      // hammer_v2 doesn't directly have archetypes in bases, inherits from base belief
      expect(inspected.bases).to.include(hammer._id);

      // But get_archetypes should walk to base
      const archetype_labels = [...hammer_v2.get_archetypes()].map(a => a.label);
      expect(archetype_labels).to.include('PortableObject');
      expect(archetype_labels).to.include('ObjectPhysical');
    });
  });

  describe('learn_about', () => {
    it('copies archetypes to different mind', () => {
      const world_mind = new DB.Mind('world', {
        workshop: {
          bases: ['Location']
        }
      });

      const player_mind = new DB.Mind('player', {});
      const workshop = world_mind.belief_by_label.workshop;
      const workshop_knowledge = player_mind.learn_about(workshop);

      const inspected = workshop_knowledge.inspect();
      expect(inspected.about._ref).to.equal(workshop._id);
      // Location inherits from ObjectPhysical
      expect(inspected.archetypes).to.deep.equal(['Location', 'ObjectPhysical']);
    });

    it('learned belief can use traits from archetype chain', () => {
      const world_mind = new DB.Mind('world', {
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'red'
          }
        }
      });

      const npc_mind = new DB.Mind('npc', {});
      const hammer = world_mind.belief_by_label.hammer;
      const hammer_belief = npc_mind.learn_about(hammer, ['color']);

      expect(hammer_belief.can_have_trait('color')).to.be.true;
      expect(hammer_belief.can_have_trait('location')).to.be.true;
      expect(hammer_belief.traits.get('color')).to.equal('red');
    });
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
          bases: ['Player'],
          traits: {
            location: 'workshop',
          },
        },
      }

      const world_mind = new DB.Mind('world', world_belief);
      const state = world_mind.create_state(1, world_mind.belief);

      let ball = world_mind.add({
        label: 'ball',
        bases: ['PortableObject'],
        traits: {
          location: 'workshop',
        },
      });

      ball = ball.with_traits({
        color: 'blue',
      });

      // Verify ball structure
      const ball_inspected = ball.inspect();
      expect(ball_inspected.traits.color).to.equal('blue');
      expect([...ball.get_archetypes()].map(a => a.label)).to.include('PortableObject');

      // Verify player
      let player = world_mind.belief_by_label.player;
      const player_mind = new DB.Mind('player_mind', {});
      player = player.with_traits({mind: player_mind});

      const player_inspected = player.inspect();
      expect(player_inspected.traits.mind._ref).to.equal(player_mind._id);

      // Verify learn_about
      const workshop = world_mind.belief_by_label.workshop;
      const workshop_knowledge = player_mind.learn_about(workshop);

      const workshop_inspected = workshop_knowledge.inspect();
      expect(workshop_inspected.about._ref).to.equal(workshop._id);
      expect(workshop_inspected.archetypes).to.include('Location');
    });
  });
});
