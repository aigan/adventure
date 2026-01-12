/**
 * Scenario system tests
 *
 * Tests scenario loading, channel abstraction, and test mode execution.
 */

import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import {
  setupBrowserMocks,
  cleanupBrowserMocks,
  create_test_session,
  run_test_scenario,
  create_mock_channel,
  reset_channel,
} from './helpers.mjs'
import { get_scenario, list_scenarios } from '../public/worker/scenarios/index.mjs'
import { Channel } from '../public/worker/channel.mjs'

describe('Scenarios', () => {
  beforeEach(() => {
    DB.reset_registries()
    reset_channel()
  })

  describe('scenario registry', () => {
    it('lists available scenarios', () => {
      const names = list_scenarios()
      expect(names).to.include('workshop')
    })

    it('returns scenario by name', () => {
      const scenario = get_scenario('workshop')
      expect(scenario).to.exist
      expect(scenario.name).to.equal('Workshop')
    })

    it('returns undefined for unknown scenario', () => {
      expect(get_scenario('nonexistent')).to.be.undefined
    })
  })

  describe('Channel abstraction', () => {
    it('BrowserChannel.post() works (would call postMessage in browser)', () => {
      // In Node.js we can't actually test postMessage, but we can test the Channel class
      const channel = new Channel()
      expect(channel._use_mock).to.be.false
    })

    it('MockChannel captures messages', () => {
      const channel = create_mock_channel()
      expect(channel._use_mock).to.be.true

      channel.post('header_set', 'Loading')
      channel.post('main_add', 'Hello', 'World')

      expect(channel.messages).to.have.lengthOf(2)
      expect(channel.messages[0]).to.deep.equal(['header_set', 'Loading'])
      expect(channel.messages[1]).to.deep.equal(['main_add', 'Hello', 'World'])
    })

    it('get_messages() filters by type', () => {
      const channel = create_mock_channel()
      channel.post('header_set', 'Loading')
      channel.post('main_add', 'Hello')
      channel.post('header_set', 'Ready')

      const headers = channel.get_messages('header_set')
      expect(headers).to.have.lengthOf(2)
      expect(headers[0]).to.deep.equal(['Loading'])
      expect(headers[1]).to.deep.equal(['Ready'])
    })

    it('clear() removes all messages', () => {
      const channel = create_mock_channel()
      channel.post('header_set', 'Loading')
      channel.post('main_add', 'Hello')

      expect(channel.messages).to.have.lengthOf(2)
      channel.clear()
      expect(channel.messages).to.have.lengthOf(0)
    })

    it('Channel.get() returns singleton', () => {
      const ch1 = Channel.get()
      const ch2 = Channel.get()
      expect(ch1).to.equal(ch2)
    })

    it('Channel.reset() clears singleton', () => {
      const ch1 = Channel.get()
      Channel.reset()
      const ch2 = Channel.get()
      expect(ch1).to.not.equal(ch2)
    })
  })

  describe('test session', () => {
    it('create_test_session() returns session with mock channel', () => {
      const { session, channel } = create_test_session()
      expect(session).to.exist
      expect(session.channel).to.equal(channel)
      expect(channel._use_mock).to.be.true
    })

    it('session.channel.post() captures messages', () => {
      const { session, channel } = create_test_session()
      session.channel.post('header_set', 'Test')
      expect(channel.messages).to.have.lengthOf(1)
      expect(channel.messages[0]).to.deep.equal(['header_set', 'Test'])
    })
  })

  describe('workshop scenario', () => {
    before(() => {
      setupBrowserMocks()
    })

    after(() => {
      cleanupBrowserMocks()
    })

    it('runs successfully', async () => {
      const { result, messages } = await run_test_scenario('workshop')
      expect(result.success).to.be.true
    })

    it('sends header_set messages', async () => {
      const { messages } = await run_test_scenario('workshop')
      const headers = messages.filter(([type]) => type === 'header_set')
      expect(headers.length).to.be.greaterThan(0)
    })

    it('sends main_add messages', async () => {
      const { messages } = await run_test_scenario('workshop')
      const main_adds = messages.filter(([type]) => type === 'main_add')
      expect(main_adds.length).to.be.greaterThan(0)
    })

    it('sets up world state', async () => {
      const { session } = await run_test_scenario('workshop')
      expect(session.world).to.exist
      expect(session.state).to.exist
      expect(session.avatar).to.exist
    })

    it('throws for unknown scenario', async () => {
      setupBrowserMocks()
      const { session } = create_test_session()
      try {
        await session.start('nonexistent')
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e.message).to.include('Unknown scenario')
      }
    })
  })
})
