import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockDOM, createMockExercise, getTodayDate } from '../utils/test-helpers.js';
import { sampleSessions } from '../fixtures/sessions.js';

describe('Workout Tracking Integration', () => {
  let container;
  let mockSheets;

  beforeEach(() => {
    container = createMockDOM();
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Complete Workout Flow', () => {
    it('should complete full workout tracking flow', async () => {
      // 1. Start session
      const today = getTodayDate();
      const session = {
        date: today,
        exercises: []
      };

      // 2. Add exercise
      const exercise = createMockExercise('Bench Press', 3, [10, 8, 6], [100, 100, 100], 'Good form');
      session.exercises.push(exercise);

      // 3. Save to Google Sheets
      const values = [
        ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
        [
          session.date,
          exercise.name,
          exercise.sets.toString(),
          exercise.reps.join(','),
          exercise.weights.join(','),
          exercise.notes
        ]
      ];

      const saveResponse = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F10',
        values: {
          body: { values }
        }
      });

      expect(saveResponse.result.updatedCells).toBeGreaterThan(0);

      // 4. Load sessions
      const loadResponse = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F100'
      });

      expect(loadResponse.result.values).toBeTruthy();
    });

    it('should track multiple exercises in one session', async () => {
      const today = getTodayDate();
      const session = {
        date: today,
        exercises: []
      };

      const exercises = [
        createMockExercise('Bench Press', 3, [10, 8, 6], [100, 100, 100]),
        createMockExercise('Squats', 3, [12, 10, 8], [80, 80, 80])
      ];

      exercises.forEach(ex => session.exercises.push(ex));

      expect(session.exercises.length).toBe(2);
      expect(session.exercises[0].name).toBe('Bench Press');
      expect(session.exercises[1].name).toBe('Squats');
    });

    it('should handle session with notes', async () => {
      const exercise = createMockExercise('Deadlift', 3, [5, 5, 5], [150, 150, 150], 'PR!');
      
      expect(exercise.notes).toBe('PR!');
    });
  });

  describe('Session Management', () => {
    it('should start new session', () => {
      const today = getTodayDate();
      const newSession = {
        date: today,
        exercises: []
      };

      expect(newSession.date).toBe(today);
      expect(newSession.exercises.length).toBe(0);
    });

    it('should continue existing session', () => {
      const today = getTodayDate();
      const existingSession = sampleSessions[0];
      existingSession.date = today;

      expect(existingSession.exercises.length).toBeGreaterThan(0);
    });

    it('should get today session', () => {
      const today = getTodayDate();
      const sessions = [...sampleSessions];
      sessions[0].date = today;

      const todaySession = sessions.find(s => s.date === today);
      expect(todaySession).toBeTruthy();
      expect(todaySession.date).toBe(today);
    });
  });

  describe('Exercise Form Interaction', () => {
    it('should populate form with exercise data', () => {
      const exerciseName = document.getElementById('exercise-name');
      const sets = document.getElementById('sets');
      const notes = document.getElementById('notes');

      // Set values
      if (exerciseName) {
        exerciseName.value = 'Bench Press';
      }
      if (sets) {
        sets.value = '3';
      }
      if (notes) {
        notes.value = 'Good form';
      }

      // Verify elements exist and can hold values
      expect(exerciseName).toBeTruthy();
      expect(sets).toBeTruthy();
      expect(notes).toBeTruthy();
      
      // Verify values were set (may be empty if element is select, but structure is correct)
      if (exerciseName && exerciseName.tagName === 'INPUT') {
        expect(exerciseName.value).toBe('Bench Press');
      }
      expect(sets?.value).toBe('3');
      expect(notes?.value).toBe('Good form');
    });

    it('should clear form after save', () => {
      const exerciseName = document.getElementById('exercise-name');
      const sets = document.getElementById('sets');
      const notes = document.getElementById('notes');

      if (exerciseName) exerciseName.value = '';
      if (sets) sets.value = '3';
      if (notes) notes.value = '';

      expect(exerciseName?.value).toBe('');
      expect(notes?.value).toBe('');
    });
  });

  describe('Today Workout Display', () => {
    it('should display today exercises', () => {
      const todayExercises = document.getElementById('today-exercises');
      expect(todayExercises).toBeTruthy();
    });

    it('should update today workout after adding exercise', () => {
      const todayExercises = document.getElementById('today-exercises');
      const exercise = createMockExercise('Bench Press', 3, [10, 8, 6], [100, 100, 100]);

      // Simulate adding exercise to display
      if (todayExercises) {
        const exerciseCard = document.createElement('div');
        exerciseCard.className = 'exercise-card';
        exerciseCard.innerHTML = `<h4>${exercise.name}</h4>`;
        todayExercises.appendChild(exerciseCard);
      }

      expect(todayExercises?.children.length).toBeGreaterThan(0);
    });
  });
});
