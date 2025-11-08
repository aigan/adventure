import { expect } from 'chai';

// Import the render functions
const { render_entity, render_table } = await import('../public/inspect.mjs');

describe('inspect.mjs', () => {
  let mockTarget;

  beforeEach(() => {
    // Create a fresh mock target for each test
    mockTarget = { innerHTML: '' };
  });

  describe('render_table', () => {
    it('renders basic table with rows', () => {
      const input = {
        table: {
          columns: ['id', 'name'],
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          row_link: {
            query: 'user',
            pass_column: ['id']
          }
        }
      };

      render_table(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<th>id</th>');
      expect(html).to.include('<th>name</th>');
      expect(html).to.include('<a href="?user=1">1</a>');
      expect(html).to.include('<a href="?user=2">2</a>');
      expect(html).to.include('Alice');
      expect(html).to.include('Bob');
    });

    it('handles missing values with dash', () => {
      const input = {
        table: {
          columns: ['id', 'optional'],
          rows: [
            { id: 1 }  // missing 'optional' field
          ],
          row_link: {
            query: 'item',
            pass_column: ['id']
          }
        }
      };

      render_table(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('-');  // Should show dash for missing value
    });
  });

  describe('render_entity', () => {
    it('renders basic entity with ID and label', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 42,
              archetypes: ['TestType'],
              traits: {'@label': 'test_entity'}
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('#42');
      expect(html).to.include('test_entity');
      expect(html).to.include('TestType');
    });

    it('renders entity with single reference trait', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 1,
              traits: {
                location: {
                  _ref: 99,
                  _type: 'Location',
                  label: 'workshop'
                }
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>location</dt>');
      expect(html).to.include('href="?location=99"');
      expect(html).to.include('#99');
      expect(html).to.include('(workshop)');
    });

    it('renders entity with Mind reference', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 10,
              traits: {
                '@label': 'player',
                mind: {
                  _ref: 7,
                  _type: 'Mind',
                  traits: {'@label': 'player_mind'},
                  states: [
                    { _ref: 8, _type: 'State' },
                    { _ref: 9, _type: 'State' }
                  ]
                }
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>mind</dt>');
      // Mind trait should link to its states, not the Mind itself
      expect(html).to.include('href="?state=8"');
      expect(html).to.include('#8');
      expect(html).to.include('href="?state=9"');
      expect(html).to.include('#9');
    });

    it('renders entity with array of primitive values', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 5,
              traits: {
                tags: ['red', 'blue', 'green']
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>tags</dt>');
      expect(html).to.include('red, blue, green');
    });

    it('renders entity with mixed array (refs and primitives)', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 7,
              traits: {
                items: [
                  { _ref: 20, _type: 'Item', label: 'sword' },
                  'raw_value',
                  { _ref: 21, _type: 'Item' }
                ]
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('href="?item=20"');
      expect(html).to.include('(sword)');
      expect(html).to.include('raw_value');
      expect(html).to.include('href="?item=21"');
    });

    it('renders entity with about relationship', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 50,
              traits: {
                '@label': 'belief_about_workshop',
                '@about': {
                  _ref: 100,
                  _type: 'Belief',
                  label: 'workshop',
                  mind_id: 1,
                  mind_label: 'world'
                }
              }
            }
          },
          mind: {
            id: 2,
            label: 'npc'
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>@about</dt>');
      expect(html).to.include('href="?belief=100"');
      expect(html).to.include('world:');
      expect(html).to.include('(workshop)');
    });

    it('renders entity with bases', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 60
            }
          }
        },
        bases: [
          { id: 10, label: 'BaseType' },
          { id: 11 }
        ]
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>Bases</dt>');
      expect(html).to.include('href="?entity&id=10"');
      expect(html).to.include('(BaseType)');
      expect(html).to.include('href="?entity&id=11"');
    });

    it('renders array trait with string values', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 70,
              traits: {'@label': 'tagged_item'},
              traits: {
                tags: ['urgent', 'review', 'pending']
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>tags</dt>');
      expect(html).to.include('urgent, review, pending');
      // Make sure they're not rendered as links
      expect(html).to.not.include('href="?urgent');
    });

    it('renders array trait with Belief references', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 71,
              traits: {'@label': 'inventory'},
              traits: {
                items: [
                  { _ref: 201, _type: 'Belief', label: 'sword' },
                  { _ref: 202, _type: 'Belief', label: 'shield' },
                  { _ref: 203, _type: 'Belief' }  // No label
                ]
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>items</dt>');
      // Check all three beliefs are linked
      expect(html).to.include('href="?belief=201"');
      expect(html).to.include('#201');
      expect(html).to.include('(sword)');
      expect(html).to.include('href="?belief=202"');
      expect(html).to.include('(shield)');
      expect(html).to.include('href="?belief=203"');
      expect(html).to.include('#203');
      // Verify comma-separated
      expect(html).to.match(/belief=201.*,.*belief=202.*,.*belief=203/);
    });

    it('renders array trait with State references', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 72,
              traits: {'@label': 'npc_with_multiple_states'},
              traits: {
                state_history: [
                  { _ref: 301, _type: 'State' },
                  { _ref: 302, _type: 'State', label: 'planning' },
                  { _ref: 303, _type: 'State', label: 'current' }
                ]
              }
            }
          }
        }
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>state_history</dt>');
      // Check all three states are linked
      expect(html).to.include('href="?state=301"');
      expect(html).to.include('#301');
      expect(html).to.include('href="?state=302"');
      expect(html).to.include('#302');
      expect(html).to.include('(planning)');
      expect(html).to.include('href="?state=303"');
      expect(html).to.include('#303');
      expect(html).to.include('(current)');
      // Verify comma-separated
      expect(html).to.match(/state=301.*,.*state=302.*,.*state=303/);
    });

    it('renders trait value with knowledge belief showing about label', () => {
      const input = {
        entity: {
          data: {
            data: {
              _id: 30,
              traits: {
                '@label': 'hammer_knowledge',
                location: {
                  _ref: 22,
                  _type: 'Belief',
                  mind_id: 5,
                  mind_label: 'Villager',
                  about_label: 'workshop'
                }
              }
            }
          },
          mind: {
            id: 6,
            label: 'player'
          }
        },
        state_id: 28
      };

      render_entity(input, mockTarget);

      const html = mockTarget.innerHTML;
      expect(html).to.include('<dt>location</dt>');
      expect(html).to.include('href="?belief=22&state=28"');
      expect(html).to.include('Villager:');
      expect(html).to.include('#22');
      expect(html).to.include('about workshop');
    });
  });
});
