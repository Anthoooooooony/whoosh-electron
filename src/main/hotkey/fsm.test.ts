import { describe, expect, it } from 'vitest'
import { createHotkeyFSM, SHORT_PRESS_THRESHOLD_MS } from './fsm.js'

describe('HotkeyFSM', () => {
  describe('initial state', () => {
    it('starts in idle with no pressStart', () => {
      const fsm = createHotkeyFSM()
      expect(fsm.getState()).toBe('idle')
      expect(fsm.getPressStartTs()).toBeNull()
    })
  })

  describe('idle state', () => {
    it('KEY_DOWN transitions to recording + emits START_RECORDING', () => {
      const fsm = createHotkeyFSM()
      const action = fsm.send({ type: 'KEY_DOWN', ts: 1000 })
      expect(action).toBe('START_RECORDING')
      expect(fsm.getState()).toBe('recording')
      expect(fsm.getPressStartTs()).toBe(1000)
    })

    it.each([
      ['KEY_UP', { type: 'KEY_UP', ts: 1000 }],
      ['CANCEL_CLICK', { type: 'CANCEL_CLICK' }],
      ['SESSION_DONE', { type: 'SESSION_DONE' }],
      ['SESSION_ERROR', { type: 'SESSION_ERROR' }],
    ] as const)('ignores %s', (_label, event) => {
      const fsm = createHotkeyFSM()
      const action = fsm.send(event)
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('idle')
    })
  })

  describe('recording state', () => {
    function startRecording(ts = 1000) {
      const fsm = createHotkeyFSM()
      fsm.send({ type: 'KEY_DOWN', ts })
      return fsm
    }

    it('ignores auto-repeat KEY_DOWN (no state change, no action)', () => {
      const fsm = startRecording(1000)
      const action = fsm.send({ type: 'KEY_DOWN', ts: 1050 })
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('recording')
      // pressStartTs should NOT be overwritten by repeat
      expect(fsm.getPressStartTs()).toBe(1000)
    })

    it(`KEY_UP < ${SHORT_PRESS_THRESHOLD_MS}ms → ABORT_SHORT, back to idle`, () => {
      const fsm = startRecording(1000)
      const action = fsm.send({ type: 'KEY_UP', ts: 1000 + SHORT_PRESS_THRESHOLD_MS - 1 })
      expect(action).toBe('ABORT_SHORT')
      expect(fsm.getState()).toBe('idle')
      expect(fsm.getPressStartTs()).toBeNull()
    })

    it(`KEY_UP >= ${SHORT_PRESS_THRESHOLD_MS}ms → COMMIT_RECORDING, into processing`, () => {
      const fsm = startRecording(1000)
      const action = fsm.send({ type: 'KEY_UP', ts: 1000 + SHORT_PRESS_THRESHOLD_MS })
      expect(action).toBe('COMMIT_RECORDING')
      expect(fsm.getState()).toBe('processing')
      expect(fsm.getPressStartTs()).toBeNull()
    })

    it('CANCEL_CLICK → ABORT_CANCEL, into canceling', () => {
      const fsm = startRecording()
      const action = fsm.send({ type: 'CANCEL_CLICK' })
      expect(action).toBe('ABORT_CANCEL')
      expect(fsm.getState()).toBe('canceling')
      expect(fsm.getPressStartTs()).toBeNull()
    })

    it('SESSION_ERROR (defensive) → DONE, back to idle', () => {
      const fsm = startRecording()
      const action = fsm.send({ type: 'SESSION_ERROR' })
      expect(action).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })

    it('SESSION_DONE is ignored in recording', () => {
      const fsm = startRecording()
      const action = fsm.send({ type: 'SESSION_DONE' })
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('recording')
    })
  })

  describe('canceling state', () => {
    function intoCanceling() {
      const fsm = createHotkeyFSM()
      fsm.send({ type: 'KEY_DOWN', ts: 0 })
      fsm.send({ type: 'CANCEL_CLICK' })
      return fsm
    }

    it.each([
      [{ type: 'KEY_DOWN', ts: 100 }, 'auto-repeat after cancel'],
      [{ type: 'KEY_UP', ts: 200 }, 'releasing key after cancel'],
    ] as const)('ignores %s (%s)', (event, _desc) => {
      const fsm = intoCanceling()
      const action = fsm.send(event)
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('canceling')
    })

    it('SESSION_DONE → DONE, back to idle', () => {
      const fsm = intoCanceling()
      const action = fsm.send({ type: 'SESSION_DONE' })
      expect(action).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })

    it('SESSION_ERROR also resolves to idle', () => {
      const fsm = intoCanceling()
      const action = fsm.send({ type: 'SESSION_ERROR' })
      expect(action).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })
  })

  describe('processing state', () => {
    function intoProcessing() {
      const fsm = createHotkeyFSM()
      fsm.send({ type: 'KEY_DOWN', ts: 0 })
      fsm.send({ type: 'KEY_UP', ts: SHORT_PRESS_THRESHOLD_MS + 100 })
      return fsm
    }

    it('ignores new KEY_DOWN during processing (cannot start new session)', () => {
      const fsm = intoProcessing()
      const action = fsm.send({ type: 'KEY_DOWN', ts: 1000 })
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('processing')
    })

    it('ignores KEY_UP during processing', () => {
      const fsm = intoProcessing()
      const action = fsm.send({ type: 'KEY_UP', ts: 2000 })
      expect(action).toBeNull()
      expect(fsm.getState()).toBe('processing')
    })

    it('SESSION_DONE → DONE, back to idle, ready for next press', () => {
      const fsm = intoProcessing()
      const action = fsm.send({ type: 'SESSION_DONE' })
      expect(action).toBe('DONE')
      expect(fsm.getState()).toBe('idle')

      // Verify next press works
      const next = fsm.send({ type: 'KEY_DOWN', ts: 5000 })
      expect(next).toBe('START_RECORDING')
      expect(fsm.getState()).toBe('recording')
    })

    it('SESSION_ERROR also resolves to idle', () => {
      const fsm = intoProcessing()
      const action = fsm.send({ type: 'SESSION_ERROR' })
      expect(action).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })
  })

  describe('end-to-end flows', () => {
    it('normal record-commit cycle', () => {
      const fsm = createHotkeyFSM()
      expect(fsm.send({ type: 'KEY_DOWN', ts: 0 })).toBe('START_RECORDING')
      expect(fsm.send({ type: 'KEY_DOWN', ts: 50 })).toBeNull() // auto-repeat
      expect(fsm.send({ type: 'KEY_DOWN', ts: 100 })).toBeNull() // auto-repeat
      expect(fsm.send({ type: 'KEY_UP', ts: 1500 })).toBe('COMMIT_RECORDING')
      expect(fsm.send({ type: 'SESSION_DONE' })).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })

    it('cancel-during-recording cycle', () => {
      const fsm = createHotkeyFSM()
      expect(fsm.send({ type: 'KEY_DOWN', ts: 0 })).toBe('START_RECORDING')
      expect(fsm.send({ type: 'CANCEL_CLICK' })).toBe('ABORT_CANCEL')
      // user still holds key, then releases
      expect(fsm.send({ type: 'KEY_UP', ts: 1500 })).toBeNull()
      // session reports done
      expect(fsm.send({ type: 'SESSION_DONE' })).toBe('DONE')
      expect(fsm.getState()).toBe('idle')
    })

    it('short-press misfire cycle', () => {
      const fsm = createHotkeyFSM()
      expect(fsm.send({ type: 'KEY_DOWN', ts: 0 })).toBe('START_RECORDING')
      expect(fsm.send({ type: 'KEY_UP', ts: 100 })).toBe('ABORT_SHORT')
      // No SESSION_DONE needed because session never really started
      expect(fsm.getState()).toBe('idle')
    })
  })
})
