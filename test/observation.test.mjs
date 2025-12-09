import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import * as Cosmos from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { setupStandardArchetypes, createMindWithBeliefs } from './helpers.mjs'

describe('observation', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('duplicate belief prevention', () => {
    it('should not create duplicate when looking at already-known entity', () => {
      // Setup world similar to world.mjs
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['color'],  // Player knows hammer's color from template
            },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')

      // Get player's mind state
      const player_state = state.get_active_state_by_host(player)

      // Explicit learn_about (like world.mjs line 200)
      player_state.learn_about(hammer)

      // Count beliefs about hammer before do_look
      const about_traittype = Traittype.get_by_label('@about')
      const beliefs_before = [...hammer.rev_trait(player_state, about_traittype)]
      const count_before = beliefs_before.length

      // Simulate do_look: get content and learn about each
      const location_traittype = Traittype.get_by_label('location')
      const content = [...workshop.rev_trait(state, location_traittype)]

      expect(content).to.include(hammer)
      expect(content).to.include(player)

      // This is what do_look does - learn about each item
      for (const item of content) {
        // Check recognize before
        const existing = player_state.recognize(item)

        player_state.learn_about(item)

        // Count after this learn_about
        const beliefs_after = [...item.rev_trait(player_state, about_traittype)]

        // For hammer, should NOT create duplicate
        if (item === hammer) {
          expect(existing.length, 'should recognize existing hammer knowledge').to.be.at.least(1)
          expect(beliefs_after.length, 'should not duplicate hammer belief').to.equal(count_before)
        }
      }
    })

    it('should match world.mjs flow exactly', () => {
      // Simplified reproduction of world.mjs init_world()
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        village: { bases: ['Location'] },
        workshop: {
          bases: ['Location'],
          traits: { location: 'village' },
        },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      expect(player, 'player belief not found').to.exist
      const player_state = state.get_active_state_by_host(player)
      const hammer = state.get_belief_by_label('hammer')
      expect(hammer, 'hammer belief not found').to.exist

      // Count beliefs BEFORE learn_about
      const about_traittype = Traittype.get_by_label('@about')
      const before = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('Before learn_about:', before.length, 'beliefs about hammer')

      player_state.learn_about(hammer)

      // Count beliefs AFTER learn_about
      const after = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('After learn_about:', after.length, 'beliefs about hammer')

      state.lock()

      // Should NOT have duplicated
      expect(after.length, 'learn_about should not create duplicate').to.equal(before.length)
    })

    it('should recognize knowledge from base state after branch', () => {
      // Setup world
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      // Get player's mind state - should branch from locked template state
      const player_state = state.get_active_state_by_host(player)

      // Recognize should find hammer knowledge from template (in base state)
      const existing = player_state.recognize(hammer)
      expect(existing.length, 'should find hammer knowledge from template').to.be.at.least(1)

      // Verify the found belief has correct @about
      const about_traittype = Traittype.get_by_label('@about')
      const about_value = existing[0].get_trait(player_state, about_traittype)
      expect(about_value).to.equal(hammer.subject)
    })

    it('should trace player_state base chain correctly', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Trace base chain
      const bases = []
      let s = player_state
      while (s) {
        bases.push({ id: s._id, locked: s.locked, mind: s.in_mind?.label })
        s = s.base
      }

      console.log('Player state base chain:', bases)

      // Player state should have a base (the template state)
      expect(player_state.base, 'player_state should have base').to.exist
      expect(player_state.base.locked, 'base state should be locked').to.be.true
    })
  })

  describe('EventPerception creation', () => {
    /**
     * Helper: Create a perceived belief in a mind state
     * @param {State} mind_state - Observer's mind state
     * @param {string[]} archetype_bases - Archetype bases (e.g., ['Hammer'])
     * @param {Object} trait_values - Trait key-value pairs
     * @param {Subject|null} about_subject - Recognized entity subject, or null if unrecognized
     * @returns {Belief} The created perceived belief
     */
    function create_perceived_belief(mind_state, archetype_bases, trait_values, about_subject = null) {
      return mind_state.add_belief_from_template({
        bases: archetype_bases,
        traits: {
          '@about': about_subject,
          ...trait_values
        }
      })
    }

    /**
     * Helper: Create an EventPerception holding perceived beliefs
     * @param {State} mind_state - Observer's mind state
     * @param {Belief[]} perceived_beliefs - Array of perceived belief objects
     * @returns {Belief} The created EventPerception belief
     */
    function create_observation(mind_state, perceived_beliefs) {
      return mind_state.add_belief_from_template({
        bases: ['EventPerception'],
        traits: {
          content: perceived_beliefs.map(b => b.subject)
        }
      })
    }

    it('should create perceived belief with flat traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief with flat traits
      const perceived = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      })

      expect(perceived).to.exist

      const color_tt = Traittype.get_by_label('color')
      const about_tt = Traittype.get_by_label('@about')

      expect(perceived.get_trait(player_state, color_tt)).to.equal('blue')
      expect(perceived.get_trait(player_state, about_tt)).to.be.null

      // Verify archetype through get_archetypes
      const archetypes = perceived.get_archetypes()
      expect(archetypes.some(a => a.label === 'PortableObject')).to.be.true
    })

    it('should create perceived belief with nested/compositional traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Register hammer traittypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        length: { type: 'string', exposure: 'visual' },
        head: { type: 'HammerHead', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
      }, {
        HammerHead: {
          bases: ['ObjectPhysical'],
          traits: { material: null, color: null }
        },
        HammerHandle: {
          bases: ['ObjectPhysical'],
          traits: { material: null, color: null, length: null }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: { head: null, handle: null }
        },
      }, {})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Create nested perceived beliefs (handle as separate belief)
      const perceived_handle = create_perceived_belief(player_state, ['HammerHandle'], {
        length: 'short',
        color: 'brown'
      })

      const perceived_hammer = create_perceived_belief(player_state, ['Hammer'], {
        handle: perceived_handle.subject
      })

      expect(perceived_hammer).to.exist
      expect(perceived_handle).to.exist

      const handle_tt = Traittype.get_by_label('handle')
      const length_tt = Traittype.get_by_label('length')

      const handle_ref = perceived_hammer.get_trait(player_state, handle_tt)
      expect(handle_ref).to.equal(perceived_handle.subject)

      const handle_belief = player_state.get_belief_by_subject(handle_ref)
      expect(handle_belief.get_trait(player_state, length_tt)).to.equal('short')
    })

    it('should create EventPerception holding multiple perceived beliefs', () => {
      // Register EventAwareness/EventPerception from world.mjs
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Create multiple perceived beliefs
      const perceived_hammer = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      })

      const perceived_workshop = create_perceived_belief(player_state, ['Location'], {})

      // Create EventPerception
      const perception = create_observation(player_state, [perceived_hammer, perceived_workshop])

      expect(perception).to.exist
      expect(perception.get_archetypes().some(a => a.label === 'EventPerception')).to.be.true

      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)

      expect(content).to.be.an('array')
      expect(content).to.have.lengthOf(2)
      expect(content).to.include(perceived_hammer.subject)
      expect(content).to.include(perceived_workshop.subject)
    })

    it('should track recognized vs unrecognized with @about', () => {
      // Register EventAwareness/EventPerception from world.mjs
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {}, location: 'workshop' }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief - recognized (workshop)
      const perceived_workshop = create_perceived_belief(player_state, ['Location'], {}, workshop.subject)

      // Create perceived belief - unrecognized (unknown hammer)
      const perceived_hammer = create_perceived_belief(player_state, ['PortableObject'], {
        color: 'blue'
      }, null)

      const about_tt = Traittype.get_by_label('@about')

      // Workshop should be recognized
      expect(perceived_workshop.get_trait(player_state, about_tt)).to.equal(workshop.subject)

      // Hammer should be unrecognized
      expect(perceived_hammer.get_trait(player_state, about_tt)).to.be.null

      // Both can be in same EventPerception
      const perception = create_observation(player_state, [perceived_workshop, perceived_hammer])
      expect(perception).to.exist
    })
  })

  describe('perceive(), identify(), learn_from()', () => {
    // Note: setupStandardArchetypes() is called in outer beforeEach above

    beforeEach(() => {
      // Register EventAwareness/EventPerception
      DB.register({
        content: { type: 'Thing', container: Array, exposure: 'internal' }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness']
        }
      }, {})
    })

    it('perceive() should create knowledge beliefs for unfamiliar entities (fast path)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {}, location: 'workshop' }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player)

      // Player doesn't know about hammer yet
      const existing = player_state.recognize(hammer)
      expect(existing.length).to.equal(0)

      // Perceive hammer
      const perception = player_state.perceive([hammer])

      expect(perception).to.exist
      expect(perception.get_archetypes().some(a => a.label === 'EventPerception')).to.be.true

      // Check content - should include hammer only (not workshop - location is spatial)
      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)
      expect(content).to.be.an('array')
      expect(content).to.have.lengthOf(1)  // hammer only (location trait excluded with default visual modalities)

      // Find hammer knowledge belief in content
      const hammer_knowledge_subject = content.find(s => {
        const b = player_state.get_belief_by_subject(s)
        const about_tt = Traittype.get_by_label('@about')
        const about = b.get_trait(player_state, about_tt)
        return about && about.sid === hammer.subject.sid
      })
      expect(hammer_knowledge_subject).to.exist

      // Get hammer knowledge belief
      const hammer_knowledge = player_state.get_belief_by_subject(hammer_knowledge_subject)
      const about_tt = Traittype.get_by_label('@about')
      const about = hammer_knowledge.get_trait(player_state, about_tt)
      expect(about).to.not.be.null  // Fast path: @about set to world entity
      expect(about.sid).to.equal(hammer.subject.sid)

      // Should have color trait
      const color_tt = Traittype.get_by_label('color')
      expect(hammer_knowledge.get_trait(player_state, color_tt)).to.equal('blue')
    })

    it('perceive() should reuse knowledge for familiar unchanged entities', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },  // Player knows hammer
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player)

      // Player should recognize hammer
      const existing_knowledge = player_state.recognize(hammer)
      expect(existing_knowledge.length).to.be.at.least(1)
      const old_knowledge_id = existing_knowledge[0]._id

      // Perceive hammer (familiar, traits unchanged)
      const perception = player_state.perceive([hammer])

      const content_tt = Traittype.get_by_label('content')
      const content = perception.get_trait(player_state, content_tt)
      expect(content).to.be.an('array')
      expect(content.length).to.equal(1)  // hammer only (location trait excluded)

      // Find hammer knowledge in content
      const hammer_subject = content.find(s => {
        const b = player_state.get_belief_by_subject(s)
        const about_tt = Traittype.get_by_label('@about')
        const about = b.get_trait(player_state, about_tt)
        return about && about.sid === hammer.subject.sid
      })
      expect(hammer_subject).to.exist

      // Should be the same belief (reused, not new version)
      const hammer_knowledge = player_state.get_belief_by_subject(hammer_subject)
      expect(hammer_knowledge._id).to.equal(old_knowledge_id)
    })

    it('identify() should match traits to knowledge beliefs', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Register hammer archetypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        length: { type: 'string', exposure: 'visual' },
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null, length: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer1: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel', length: 'short' }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'wood', length: 'long' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['material', 'length'],  // Player knows hammer1
              hammer2: ['material', 'length']   // Player knows hammer2
            },
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief matching hammer1
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          material: 'steel',
          length: 'short'
        }
      })

      // Identify should return hammer1
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.be.at.least(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('identify() should return multiple candidates for ambiguous matches', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      DB.register({
        material: { type: 'string', exposure: 'visual' }
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer1: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }  // Same material
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['material'],
              hammer2: ['material']
            },
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief with only material
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          material: 'steel'
        }
      })

      // Identify should return both hammers (ambiguous)
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(2)
      expect(candidates).to.include(hammer1.subject)
      expect(candidates).to.include(hammer2.subject)
    })

    it('perceive() should auto-update knowledge when new traits are visible', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      DB.register({
        material: { type: 'string', exposure: 'visual' }
      }, {
        Hammer: {
          bases: ['PortableObject'],
          traits: { material: null }
        }
      }, {})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['Hammer'],
          traits: { location: 'workshop', material: 'steel' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['location'] },  // Player knows hammer's location only
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const player_state = state.get_active_state_by_host(player)

      // Player has minimal knowledge (can recognize)
      const old_knowledge = player_state.recognize(hammer)
      expect(old_knowledge.length).to.be.at.least(1)
      const old_knowledge_id = old_knowledge[0]._id
      const material_tt = Traittype.get_by_label('material')
      expect(old_knowledge[0].get_trait(player_state, material_tt)).to.be.null  // Doesn't know material yet

      // Perceive hammer (familiar, but material now visible)
      player_state.perceive([hammer])

      // Fast path should automatically create versioned belief with material trait
      const updated_knowledge = player_state.recognize(hammer)
      expect(updated_knowledge.length).to.be.at.least(1)
      expect(updated_knowledge[0].get_trait(player_state, material_tt)).to.equal('steel')

      // Should be a new version (different _id but same subject)
      expect(updated_knowledge[0]._id).to.not.equal(old_knowledge_id)
      expect(updated_knowledge[0].subject.sid).to.equal(old_knowledge[0].subject.sid)
    })

    it('learn_from() should handle familiar entities (direct subject refs)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },  // Player already knows hammer
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const player_state = state.get_active_state_by_host(player)

      // Count beliefs before
      const about_tt = Traittype.get_by_label('@about')
      const beliefs_before = [...hammer.rev_trait(player_state, about_tt)]

      // Perceive hammer (familiar - will be direct subject ref)
      const perception = player_state.perceive([hammer])

      // Learn from perception
      player_state.learn_from(perception)

      // Should not create duplicate
      const beliefs_after = [...hammer.rev_trait(player_state, about_tt)]
      expect(beliefs_after.length).to.equal(beliefs_before.length)
    })

    it('end-to-end: perceive location content with familiar entities', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' }
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['location'] },  // Player knows hammer's location only
            location: 'workshop'
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')
      const workshop = state.get_belief_by_label('workshop')
      const player_state = state.get_active_state_by_host(player)

      // Verify initial knowledge - knows location but not color
      const old_knowledge = player_state.recognize(hammer)
      expect(old_knowledge.length).to.be.at.least(1)
      const color_tt = Traittype.get_by_label('color')
      expect(old_knowledge[0].get_trait(player_state, color_tt)).to.be.null

      // Get location content (what player can see)
      const location_tt = Traittype.get_by_label('location')
      const content = [...workshop.rev_trait(state, location_tt)]

      // Player perceives location content (fast path auto-updates knowledge)
      const perception = player_state.perceive(content)

      // Player should now know about hammer's color (automatically updated)
      const updated_knowledge = player_state.recognize(hammer)
      expect(updated_knowledge.length).to.be.at.least(1)

      // Knowledge should include color (newly observed)
      expect(updated_knowledge[0].get_trait(player_state, color_tt)).to.equal('blue')

      // Should be a new version
      expect(updated_knowledge[0]._id).to.not.equal(old_knowledge[0]._id)
    })

    it('should reuse prototype/shared beliefs for nested parts of uncertain entities', () => {
      // Register hammer archetypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
        '@uncertain_identity': { type: 'boolean', exposure: 'internal' }
      }, {
        HammerHandle: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null  // Inherit from Thing via PortableObject
          }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: {
            handle: null,
            '@uncertain_identity': null  // Inherit from Thing via PortableObject
          }
        }
      }, {})

      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create shared prototype for handle
      state.add_shared_from_template({
        CommonHandle: {
          bases: ['HammerHandle'],
          traits: { material: 'wood' }
        }
      })

      // Create two uncertain hammers with same shared handle
      state.add_beliefs_from_template({
        hammer1: {
          bases: ['Hammer'],
          traits: {
            '@uncertain_identity': true,
            handle: 'CommonHandle'
          }
        },
        hammer2: {
          bases: ['Hammer'],
          traits: {
            '@uncertain_identity': true,
            handle: 'CommonHandle'
          }
        },
        player: {
          bases: ['Person'],
          traits: { mind: {} }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player)

      // Perceive first hammer
      player_state.perceive([hammer1])

      // Find the handle knowledge belief created
      const handle_tt = Traittype.get_by_label('handle')
      const about_tt = Traittype.get_by_label('@about')

      let handle_knowledge = null
      for (const belief of player_state.get_beliefs()) {
        const about = belief.get_trait(player_state, about_tt)
        if (about) {
          // Check if this is knowledge about a handle
          const archetypes = [...belief.get_archetypes()]
          if (archetypes.some(a => a.label === 'HammerHandle')) {
            handle_knowledge = belief
            break
          }
        }
      }

      expect(handle_knowledge, 'handle knowledge should exist').to.exist
      const handle_id_1 = handle_knowledge._id

      // Perceive second hammer with same handle
      player_state.perceive([hammer2])

      // Find handle knowledge again
      let handle_knowledge_2 = null
      for (const belief of player_state.get_beliefs()) {
        const about = belief.get_trait(player_state, about_tt)
        if (about) {
          const archetypes = [...belief.get_archetypes()]
          if (archetypes.some(a => a.label === 'HammerHandle')) {
            handle_knowledge_2 = belief
            break
          }
        }
      }

      expect(handle_knowledge_2, 'handle knowledge should still exist').to.exist

      // The handle knowledge should be reused (same _id)
      // because it's a certain shared prototype, not uncertain
      expect(handle_knowledge_2._id).to.equal(handle_id_1,
        'shared prototype handle should be reused, not duplicated')
    })
  })

  describe('perception modalities and tree pruning', () => {
    it('should not perceive spatial traits with default visual modalities', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world with locations
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        village: {
          bases: ['Location'],
        },
        workshop: {
          bases: ['Location'],
          traits: {
            location: 'village',  // spatial trait
          },
        },
        person1: {
          bases: ['Person'],
          traits: {
            location: 'workshop',  // spatial trait
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {},
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const person1 = state.get_belief_by_label('person1')
      const workshop = state.get_belief_by_label('workshop')

      let player_state = state.get_active_state_by_host(player)

      // Perceive person1 with default modalities (visual only)
      const perception = player_state.perceive([person1])

      // Should only perceive person1, NOT workshop or village
      // (location trait has exposure: spatial, excluded by default)
      const beliefs_after = [...player_state.get_beliefs()]
      const about_tt = Traittype.get_by_label('@about')

      // Count beliefs about world entities (exclude EventPerception)
      const knowledge_beliefs = beliefs_after.filter(b => {
        const about = b.get_trait(player_state, about_tt)
        return about !== null  // Has @about → knowledge belief
      })

      // Should only have knowledge about person1, not workshop or village
      expect(knowledge_beliefs.length).to.equal(1)
      expect(knowledge_beliefs[0].get_trait(player_state, about_tt).sid).to.equal(person1.subject.sid)
    })

    it('should reuse current memory and stop tree walk (recognition-based pruning)', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1, vt: 1})

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              // Player already knows about hammer with same traits
              hammer: ['color'],
            },
            location: 'workshop',
          },
        }
      })

      state.lock()

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      let player_state = state.get_active_state_by_host(player)

      // Player already has knowledge about hammer
      const knowledge_before = player_state.recognize(hammer)
      expect(knowledge_before.length).to.be.at.least(1)
      const original_knowledge = knowledge_before[0]

      // Perceive hammer again (same state, same traits)
      const perception = player_state.perceive([hammer])

      // Should reuse existing knowledge belief (not create new one)
      const knowledge_after = player_state.recognize(hammer)
      expect(knowledge_after.length).to.be.at.least(1)

      // Same belief object (recognition-based pruning worked)
      expect(knowledge_after[0]._id).to.equal(original_knowledge._id)
    })

    it('should create new perception when world state is stale', () => {
      // Register EventPerception archetypes
      DB.register({
        content: { type: 'Thing', container: Array }
      }, {
        EventAwareness: {
          bases: ['Thing'],
          traits: { content: null }
        },
        EventPerception: {
          bases: ['EventAwareness'],
          traits: { content: null }
        }
      }, {})

      // Setup world at vt=1
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1, vt: 1})

      state.add_beliefs_from_template({
        hammer: {
          bases: ['PortableObject'],
          traits: {
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['color'],
            },
          },
        }
      })

      state.lock()

      const player = state.get_belief_by_label('player')
      const hammer = state.get_belief_by_label('hammer')

      let player_state = state.get_active_state_by_host(player)

      // Player's memory created at tt=1
      const knowledge_before = player_state.recognize(hammer)
      expect(knowledge_before.length).to.be.at.least(1)
      expect(knowledge_before[0].origin_state.tt).to.equal(1)

      // World progresses to vt=2
      state = state.branch(Cosmos.logos_state(), 2)

      // Update hammer in world
      const hammer_v2 = hammer.branch(state, {color: 'red'})

      player_state = state.get_active_state_by_host(player)

      // Perceive updated hammer (world.vt=2 > memory.tt=1)
      const perception = player_state.perceive([hammer_v2])

      // Should create NEW perception (memory is stale)
      const knowledge_after = player_state.recognize(hammer_v2)
      expect(knowledge_after.length).to.be.at.least(1)

      // Different belief (new perception created)
      expect(knowledge_after[0]._id).to.not.equal(knowledge_before[0]._id)

      // New memory has updated color
      const color_tt = Traittype.get_by_label('color')
      expect(knowledge_after[0].get_trait(player_state, color_tt)).to.equal('red')
    })
  })

  // TODO: Fix test setup issues with state management
  describe.skip('identify() optimization', () => {
    beforeEach(() => {
      // Register common traittypes
      DB.register({
        material: { type: 'string', exposure: 'visual' },
        handle: { type: 'HammerHandle', exposure: 'visual' },
        head: { type: 'HammerHead', exposure: 'visual' },
        '@uncertain_identity': { type: 'boolean', exposure: 'internal' }
      }, {
        HammerHead: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null
          }
        },
        HammerHandle: {
          bases: ['PortableObject'],
          traits: {
            material: null,
            '@uncertain_identity': null
          }
        },
        Hammer: {
          bases: ['PortableObject'],
          traits: {
            head: null,
            handle: null,
            material: null,
            '@uncertain_identity': null
          }
        }
      }, {})
    })

    it('should use rev_trait for certain particular Subject traits', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create specific head that only 2 hammers use
      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        head2: { bases: ['HammerHead'], traits: { material: 'iron' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', material: 'heavy' } },
        hammer2: { bases: ['Hammer'], traits: { head: 'head1', material: 'light' } },
        hammer3: { bases: ['Hammer'], traits: { head: 'head2', material: 'medium' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['head', 'material'],
              hammer2: ['head', 'material'],
              hammer3: ['head', 'material']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief with certain head
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,  // Certain particular
          material: 'heavy'
        }
      })

      // Identify should use rev_trait on head1, find 2 hammers, verify material
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(1)  // Only hammer1 matches (material filtered)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should stop at max_candidates (default 3)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Create 10 identical hammers
      const hammers = {}
      for (let i = 0; i < 10; i++) {
        hammers[`hammer${i}`] = { bases: ['Hammer'], traits: { material: 'steel' } }
      }

      state.add_beliefs_from_template({
        ...hammers,
        player: {
          bases: ['Person'],
          traits: {
            mind: Object.fromEntries(
              Object.keys(hammers).map(k => [k, ['material']])
            )
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, material: 'steel' }
      })

      // Should return only 3 candidates (not all 10)
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(3)  // Max candidates = 3
    })

    it('should return breadth-first (most recent first)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        hammer1: { bases: ['Hammer'], traits: { material: 'steel' } },
        player: {
          bases: ['Person'],
          traits: { mind: { hammer1: ['material'] } }
        }
      })

      state.lock()

      // Add more hammers at different timestamps
      state = state.branch(Cosmos.logos_state(), 2)
      state.add_beliefs_from_template({
        hammer2: { bases: ['Hammer'], traits: { material: 'steel' } }
      })
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(state.get_belief_by_label('player'))
      player_state.learn_about(hammer2)

      state.lock()
      state = state.branch(Cosmos.logos_state(), 3)
      state.add_beliefs_from_template({
        hammer3: { bases: ['Hammer'], traits: { material: 'steel' } }
      })
      const hammer3 = state.get_belief_by_label('hammer3')
      const player_state2 = state.get_active_state_by_host(state.get_belief_by_label('player'))
      player_state2.learn_about(hammer3)

      // Create perceived belief
      const perceived = player_state2.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, material: 'steel' }
      })

      // Should return in temporal order (newest first)
      const candidates = player_state2.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(3)
      // Most recent should be first
      expect(candidates[0]).to.equal(hammer3.subject)
    })

    it('should handle no certain traits (fallback to archetype)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        hammer1: { bases: ['Hammer'], traits: { '@uncertain_identity': true } },
        player: {
          bases: ['Person'],
          traits: { mind: { hammer1: [] } }  // Knows hammer exists but no traits
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player)

      // Create perceived belief with only archetype (no discriminating traits)
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null }
      })

      // Should fall back to archetype scan
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.be.at.least(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should verify all traits match when using rev_trait', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', material: 'steel' } },
        hammer2: { bases: ['Hammer'], traits: { head: 'head1', material: 'wood' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['head', 'material'],
              hammer2: ['head', 'material']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const hammer1 = state.get_belief_by_label('hammer1')
      const player_state = state.get_active_state_by_host(player)

      // Perceived: head1 + material steel
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,
          material: 'steel'
        }
      })

      // rev_trait(head1, 'head') returns [hammer1, hammer2]
      // But only hammer1 matches material: 'steel'
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(1)
      expect(candidates[0]).to.equal(hammer1.subject)
    })

    it('should handle refurbished parts (recognized part moved to new assembly)', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        head1: { bases: ['HammerHead'], traits: { material: 'steel' } },
        handle1: { bases: ['HammerHandle'], traits: { material: 'wood' } },
        handle2: { bases: ['HammerHandle'], traits: { material: 'oak' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'head1', handle: 'handle1' } },
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['head', 'handle']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head1 = state.get_belief_by_label('head1')
      const handle2 = state.get_belief_by_label('handle2')
      const player_state = state.get_active_state_by_host(player)

      // Perceived: head1 (certain) + handle2 (different from hammer1's handle!)
      const perceived = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: {
          '@about': null,
          head: head1.subject,
          handle: handle2.subject
        }
      })

      // rev_trait(head1, 'head') finds hammer1
      // But _all_traits_match() rejects it (handle mismatch)
      const candidates = player_state.identify(perceived)
      expect(candidates).to.be.an('array')
      expect(candidates.length).to.equal(0)  // No match - head was moved to new handle
    })

    it('should distinguish prototype vs particular matching', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      // Add shared prototype in Eidos
      state.add_shared_from_template({
        GenericHead: { bases: ['HammerHead'], traits: { material: 'generic' } }
      })

      state.add_beliefs_from_template({
        head_particular: { bases: ['HammerHead'], traits: { material: 'specific' } },
        hammer1: { bases: ['Hammer'], traits: { head: 'GenericHead' } },  // Prototype
        hammer2: { bases: ['Hammer'], traits: { head: 'head_particular' } },  // Particular
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer1: ['head'],
              hammer2: ['head']
            }
          }
        }
      })

      state.lock()
      state = state.branch(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      const head_particular = state.get_belief_by_label('head_particular')
      const hammer2 = state.get_belief_by_label('hammer2')
      const player_state = state.get_active_state_by_host(player)

      // Perceived: particular head (should use rev_trait)
      const perceived_particular = player_state.add_belief_from_template({
        bases: ['Hammer'],
        traits: { '@about': null, head: head_particular.subject }
      })

      const candidates_particular = player_state.identify(perceived_particular)
      expect(candidates_particular).to.be.an('array')
      expect(candidates_particular.length).to.equal(1)
      expect(candidates_particular[0]).to.equal(hammer2.subject)
    })
  })
})
