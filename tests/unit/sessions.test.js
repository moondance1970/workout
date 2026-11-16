import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { sampleSessions, emptySession } from '../fixtures/sessions.js';
import { createMockSession, getTodayDate, createMockLocalStorage } from '../utils/test-helpers.js';

describe('Sessions', () => {
  let mockSheets;

  beforeEach(() => {
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Session Structure', () => {
    it('should create a valid session object', () => {
      const session = createMockSession('2024-01-15', []);
      
      expect(session).toHaveProperty('date');
      expect(session).toHaveProperty('exercises');
      expect(session.date).toBe('2024-01-15');
      expect(Array.isArray(session.exercises)).toBe(true);
    });

    it('should create today session with current date', () => {
      const today = getTodayDate();
      const session = createMockSession(today, []);
      
      expect(session.date).toBe(today);
    });

    it('should handle session with exercises', () => {
      const session = sampleSessions[0];
      
      expect(session.exercises.length).toBeGreaterThan(0);
      expect(session.exercises[0]).toHaveProperty('name');
      expect(session.exercises[0]).toHaveProperty('sets');
      expect(session.exercises[0]).toHaveProperty('reps');
      expect(session.exercises[0]).toHaveProperty('weights');
    });
  });

  describe('Session Data Format', () => {
    it('should format session date correctly', () => {
      const date = new Date('2024-01-15');
      const formatted = date.toISOString().split('T')[0];
      
      expect(formatted).toBe('2024-01-15');
    });

    it('should handle exercise with multiple sets', () => {
      const exercise = sampleSessions[0].exercises[0];
      
      expect(exercise.sets).toBe(3);
      expect(exercise.reps.length).toBe(3);
      expect(exercise.weights.length).toBe(3);
    });

    it('should handle bodyweight exercises (weight = 0)', () => {
      const bodyweightExercise = sampleSessions[0].exercises.find(
        ex => ex.name === 'Pull-ups'
      );
      
      expect(bodyweightExercise).toBeTruthy();
      expect(bodyweightExercise.weights.every(w => w === 0)).toBe(true);
    });

    it('should handle notes field', () => {
      const sessionWithNotes = sampleSessions[0];
      const exerciseWithNotes = sessionWithNotes.exercises.find(
        ex => ex.notes && ex.notes.length > 0
      );
      
      expect(exerciseWithNotes).toBeTruthy();
      expect(exerciseWithNotes.notes).toBe('Good form today');
    });
  });

  describe('Session Operations', () => {
    it('should get today session', () => {
      const today = getTodayDate();
      const todaySession = createMockSession(today, []);
      
      expect(todaySession.date).toBe(today);
    });

    it('should find session by date', () => {
      const targetDate = '2024-01-15';
      const session = sampleSessions.find(s => s.date === targetDate);
      
      expect(session).toBeTruthy();
      expect(session.date).toBe(targetDate);
    });

    it('should handle empty session', () => {
      expect(emptySession.exercises.length).toBe(0);
      expect(emptySession.date).toBeTruthy();
    });

    it('should add exercise to session', () => {
      const session = createMockSession('2024-01-15', []);
      const exercise = {
        name: 'Bench Press',
        sets: 3,
        reps: [10, 8, 6],
        weights: [100, 100, 100]
      };
      
      session.exercises.push(exercise);
      
      expect(session.exercises.length).toBe(1);
      expect(session.exercises[0].name).toBe('Bench Press');
    });
  });

  describe('Session Filtering', () => {
    it('should filter sessions by date range', () => {
      const startDate = '2024-01-15';
      const endDate = '2024-01-16';
      
      const filtered = sampleSessions.filter(session => {
        return session.date >= startDate && session.date <= endDate;
      });
      
      expect(filtered.length).toBe(2);
    });

    it('should filter sessions by exercise name', () => {
      const exerciseName = 'Bench Press';
      
      const filtered = sampleSessions.filter(session => {
        return session.exercises.some(ex => ex.name === exerciseName);
      });
      
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(session => {
        expect(session.exercises.some(ex => ex.name === exerciseName)).toBe(true);
      });
    });
  });

  describe('Session Deletion', () => {
    it('should remove session from array', () => {
      const sessions = [...sampleSessions];
      const targetDate = '2024-01-15';
      
      const index = sessions.findIndex(s => s.date === targetDate);
      if (index >= 0) {
        sessions.splice(index, 1);
      }
      
      expect(sessions.find(s => s.date === targetDate)).toBeUndefined();
      expect(sessions.length).toBe(sampleSessions.length - 1);
    });
  });

  describe('Resuming an active session across a reload', () => {
    // Regression coverage: a real bug report - the user logged 2 exercises, closed
    // the app mid-session, reopened it, and the "Start Session" button reappeared
    // instead of resuming. Root cause: sessionActive was in-memory only (never
    // persisted), so a fresh page load always reset it to false regardless of
    // whether a session was genuinely still in progress. Mirrors
    // setSessionActive()/resumeActiveSessionIfAny().

    let localStorage;

    beforeEach(() => {
      localStorage = createMockLocalStorage();
    });

    const setSessionActive = (store, active, today) => {
      store.setItem('sessionActive', active ? 'true' : 'false');
      if (active) store.setItem('sessionActiveDate', today);
    };

    const shouldResume = (store, today) => {
      if (store.getItem('sessionActive') !== 'true') return false;
      return store.getItem('sessionActiveDate') === today;
    };

    it('should persist sessionActive when a session starts', () => {
      setSessionActive(localStorage, true, '2026-11-16');
      expect(localStorage.getItem('sessionActive')).toBe('true');
      expect(localStorage.getItem('sessionActiveDate')).toBe('2026-11-16');
    });

    it('should resume on reload the same day a session was left active', () => {
      setSessionActive(localStorage, true, '2026-11-16');
      expect(shouldResume(localStorage, '2026-11-16')).toBe(true);
    });

    it('should NOT resume a stale active flag from a previous day', () => {
      setSessionActive(localStorage, true, '2026-11-15'); // yesterday
      expect(shouldResume(localStorage, '2026-11-16')).toBe(false); // today
    });

    it('should not resume once a session has been properly ended', () => {
      setSessionActive(localStorage, true, '2026-11-16');
      setSessionActive(localStorage, false, '2026-11-16');
      expect(shouldResume(localStorage, '2026-11-16')).toBe(false);
    });

    it('should not resume when no session was ever started', () => {
      expect(shouldResume(localStorage, '2026-11-16')).toBe(false);
    });
  });
});
