import { expect } from 'chai';

// Set up mock DOM elements before importing inspect.mjs
const mockPathBar = { innerHTML: '' };
const mockStateTable = { innerHTML: '' };
const mockHeader = { innerHTML: '' };
const mockMain = { innerHTML: '' };

// Mock document.querySelector
globalThis.document = {
  querySelector: (selector) => {
    if (selector === '.path-bar') return mockPathBar;
    if (selector === '.state-table') return mockStateTable;
    if (selector === 'header') return mockHeader;
    if (selector === 'main') return mockMain;
    return null;
  }
};

// Mock BroadcastChannel
globalThis.BroadcastChannel = class {
  constructor() {}
  postMessage() {}
  close() {}
};

// Mock location
globalThis.location = { search: '' };

// Now import - it will use our mocks
const { render_entity } = await import('../public/inspect.mjs');
import { setupAfterEachValidation } from './helpers.mjs';

describe('inspect.mjs', () => {
  beforeEach(() => {
    // Reset mock elements before each test
    mockPathBar.innerHTML = '';
    mockStateTable.innerHTML = '';
    mockHeader.innerHTML = '';
    mockMain.innerHTML = '';
  });
  setupAfterEachValidation();

  describe('render_entity', () => {
    it('renders basic entity with ID and label', () => {
      const input = {
        data: {
          data: {
            _id: 42,
            archetypes: ['TestType'],
            traits: {},
            label: 'test_entity'
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'test_mind' },
        desig: '[TestType] test_entity #42',
        bases: []
      };

      render_entity(input);

      // ID appears in header (via desig) and raw JSON
      expect(mockHeader.innerHTML).to.include('#42');
      expect(mockHeader.innerHTML).to.include('test_entity');
      // Belief chip in path bar shows label and archetype
      expect(mockPathBar.innerHTML).to.include('test_entity');
      expect(mockPathBar.innerHTML).to.include('[TestType]');
    });

    it('renders entity with single reference trait', () => {
      const input = {
        data: {
          data: {
            _id: 1,
            archetypes: ['Location'],
            traits: {
              location: {
                _ref: 99,
                _type: 'Belief',
                label: 'workshop'
              }
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('location');
      expect(html).to.include('href="?belief=99');
      expect(html).to.include('#99');
      expect(html).to.include('(workshop)');
    });

    it('renders entity with Mind reference', () => {
      const input = {
        data: {
          data: {
            _id: 10,
            archetypes: ['Person'],
            traits: {
              mind: {
                _ref: 7,
                _type: 'Mind',
                label: 'player_mind',
                states: [
                  { _ref: 8, _type: 'State' },
                  { _ref: 9, _type: 'State' }
                ]
              }
            },
            label: 'player'
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('mind');
      // Mind trait should link to core state (first state in array)
      expect(html).to.include('href="?mind=7&state=8"');
      expect(html).to.include('Mind #7');
      expect(html).to.include('(player_mind)');
    });

    it('renders entity with array of primitive values', () => {
      const input = {
        data: {
          data: {
            _id: 5,
            archetypes: ['Item'],
            traits: {
              tags: ['red', 'blue', 'green']
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('tags');
      expect(html).to.include('red, blue, green');
    });

    it('renders entity with mixed array (refs and primitives)', () => {
      const input = {
        data: {
          data: {
            _id: 7,
            archetypes: ['Container'],
            traits: {
              items: [
                { _ref: 20, _type: 'Belief', label: 'sword' },
                'raw_value',
                { _ref: 21, _type: 'Belief' }
              ]
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('href="?belief=20');
      expect(html).to.include('(sword)');
      expect(html).to.include('raw_value');
      expect(html).to.include('href="?belief=21');
    });

    it('renders entity with about relationship', () => {
      const input = {
        data: {
          data: {
            _id: 50,
            archetypes: ['Knowledge'],
            traits: {
              '@about': {
                _ref: 100,
                _type: 'Belief',
                label: 'workshop',
                mind_id: 1,
                mind_label: 'world'
              }
            },
            label: 'belief_about_workshop'
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 2, label: 'npc' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('@about');
      expect(html).to.include('href="?belief=100');
      expect(html).to.include('world:');
      expect(html).to.include('(workshop)');
    });

    it('renders entity with bases', () => {
      const input = {
        data: {
          data: {
            _id: 60,
            archetypes: ['Item'],
            traits: {}
          }
        },
        state_id: 5,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 5, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: [
          { id: 10, label: 'BaseType' },
          { id: 11, label: null },
          { label: 'Thing' }  // Archetype - no id
        ]
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('Base');
      expect(html).to.include('href="?belief=10&state=5"');
      expect(html).to.include('BaseType');
      expect(html).to.include('href="?belief=11&state=5"');
      expect(html).to.include('Thing');  // Archetype displayed as text
    });

    it('renders array trait with string values', () => {
      const input = {
        data: {
          data: {
            _id: 70,
            archetypes: ['Item'],
            label: 'tagged_item',
            traits: {
              tags: ['urgent', 'review', 'pending']
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('tags');
      expect(html).to.include('urgent, review, pending');
      // Make sure they're not rendered as links
      expect(html).to.not.include('href="?urgent');
    });

    it('renders array trait with Belief references', () => {
      const input = {
        data: {
          data: {
            _id: 71,
            archetypes: ['Container'],
            label: 'inventory',
            traits: {
              items: [
                { _ref: 201, _type: 'Belief', label: 'sword' },
                { _ref: 202, _type: 'Belief', label: 'shield' },
                { _ref: 203, _type: 'Belief' }  // No label
              ]
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('items');
      // Check all three beliefs are linked
      expect(html).to.include('href="?belief=201');
      expect(html).to.include('#201');
      expect(html).to.include('(sword)');
      expect(html).to.include('href="?belief=202');
      expect(html).to.include('(shield)');
      expect(html).to.include('href="?belief=203');
      expect(html).to.include('#203');
    });

    it('renders array trait with State references', () => {
      const input = {
        data: {
          data: {
            _id: 72,
            archetypes: ['Actor'],
            label: 'npc_with_multiple_states',
            traits: {
              state_history: [
                { _ref: 301, _type: 'State' },
                { _ref: 302, _type: 'State', label: 'planning' },
                { _ref: 303, _type: 'State', label: 'current' }
              ]
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('state_history');
      // Check all three states are linked
      expect(html).to.include('href="?state=301"');
      expect(html).to.include('#301');
      expect(html).to.include('href="?state=302"');
      expect(html).to.include('#302');
      expect(html).to.include('(planning)');
      expect(html).to.include('href="?state=303"');
      expect(html).to.include('#303');
      expect(html).to.include('(current)');
    });

    it('renders trait value with knowledge belief showing about label', () => {
      const input = {
        data: {
          data: {
            _id: 30,
            archetypes: ['Knowledge'],
            traits: {
              location: {
                _ref: 22,
                _type: 'Belief',
                mind_id: 5,
                mind_label: 'Villager',
                about_label: 'workshop'
              }
            },
            label: 'hammer_knowledge'
          }
        },
        state_id: 28,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 28, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 6, label: 'player' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('location');
      expect(html).to.include('href="?belief=22&state=28"');
      expect(html).to.include('Villager:');
      expect(html).to.include('#22');
      expect(html).to.include('about workshop');
    });

    it('renders path bar with mind hierarchy', () => {
      const input = {
        data: {
          data: {
            _id: 50,
            archetypes: ['Item'],
            label: 'badge1',
            traits: {}
          }
        },
        state_id: 1,
        state_vt: 847,
        mind_path: [
          { id: 1, label: 'world', vt: 847 },
          { id: 35, label: 'person1', vt: 847 }
        ],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 35, label: 'person1' },
        desig: '[Item] badge1 #50',
        bases: []
      };

      render_entity(input);

      const pathHtml = mockPathBar.innerHTML;
      expect(pathHtml).to.include('world');
      expect(pathHtml).to.include(':847');
      expect(pathHtml).to.include('person1');
      expect(pathHtml).to.include('badge1');
      expect(pathHtml).to.include('chip mind');
      expect(pathHtml).to.include('chip belief current');
    });

    it('renders state table with parent/sibling/child states', () => {
      const input = {
        data: {
          data: {
            _id: 50,
            archetypes: ['Item'],
            label: 'test',
            traits: {}
          }
        },
        state_id: 1060,
        state_vt: 847,
        mind_path: [],
        sibling_states: [
          { id: 1059, is_current: false },
          { id: 1060, is_current: true },
          { id: 1061, is_current: false }
        ],
        parent_state_ids: [1058],
        branch_ids: [1062, 1063],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const stateHtml = mockStateTable.innerHTML;
      // Parents
      expect(stateHtml).to.include('#1058');
      // Current sibling (active)
      expect(stateHtml).to.include('state-chip active');
      expect(stateHtml).to.include('#1060');
      // Other siblings (links)
      expect(stateHtml).to.include('#1059');
      expect(stateHtml).to.include('#1061');
      // Children
      expect(stateHtml).to.include('#1062');
      expect(stateHtml).to.include('#1063');
    });

    it('renders Fuzzy unknown value as question mark', () => {
      const input = {
        data: {
          data: {
            _id: 80,
            archetypes: ['Location'],
            label: 'tavern',
            traits: {
              location: {
                _type: 'Fuzzy',
                unknown: true
              }
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('location');
      expect(html).to.include('❓');
      expect(html).to.include('fuzzy-unknown');
    });

    it('renders Fuzzy superposition as table with probabilities', () => {
      const input = {
        data: {
          data: {
            _id: 81,
            archetypes: ['Item'],
            label: 'compass',
            traits: {
              direction: {
                _type: 'Fuzzy',
                alternatives: [
                  { value: 'north', certainty: 0.6 },
                  { value: 'east', certainty: 0.4 }
                ]
              }
            }
          }
        },
        state_id: 1,
        state_vt: 100,
        mind_path: [],
        sibling_states: [{ id: 1, is_current: true }],
        parent_state_ids: [],
        branch_ids: [],
        mind: { id: 1, label: 'world' },
        desig: 'test',
        bases: []
      };

      render_entity(input);

      const html = mockMain.innerHTML;
      expect(html).to.include('direction');
      expect(html).to.include('fuzzy-superposition');
      expect(html).to.include('north');
      expect(html).to.include('60%');
      expect(html).to.include('east');
      expect(html).to.include('40%');
    });
  });
});
