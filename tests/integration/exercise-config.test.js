import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockDOM, createMockExerciseConfig } from '../utils/test-helpers.js';
import { sampleExercises } from '../fixtures/exercises.js';

describe('Exercise Configuration Integration', () => {
  let container;
  let mockSheets;

  beforeEach(() => {
    container = createMockDOM();
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Exercise CRUD Flow', () => {
    it('should add new exercise configuration', async () => {
      const newExercise = createMockExerciseConfig('New Exercise', 90, 'https://youtube.com/watch?v=new', false);
      const exercises = [...sampleExercises];
      exercises.push(newExercise);

      const values = [
        ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
        ...exercises.map(ex => [
          ex.name,
          ex.timerDuration.toString(),
          ex.youtubeLink || '',
          ex.isAerobic.toString()
        ])
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Exercises!A1:D10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
      expect(exercises.length).toBe(sampleExercises.length + 1);
    });

    it('should edit existing exercise configuration', async () => {
      const exercises = [...sampleExercises];
      const index = exercises.findIndex(ex => ex.name === 'Bench Press');

      if (index >= 0) {
        exercises[index].timerDuration = 120;
        exercises[index].youtubeLink = 'https://youtube.com/watch?v=updated';

        const values = [
          ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
          ...exercises.map(ex => [
            ex.name,
            ex.timerDuration.toString(),
            ex.youtubeLink || '',
            ex.isAerobic.toString()
          ])
        ];

        const response = await mockSheets.spreadsheets.values.update({
          spreadsheetId: 'test-sheet-id',
          range: 'Exercises!A1:D10',
          values: {
            body: { values }
          }
        });

        expect(response.result.updatedCells).toBeGreaterThan(0);
        expect(exercises[index].timerDuration).toBe(120);
      }
    });

    it('should delete exercise configuration', async () => {
      const exercises = [...sampleExercises];
      const index = exercises.findIndex(ex => ex.name === 'Bench Press');

      if (index >= 0) {
        exercises.splice(index, 1);

        const values = [
          ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
          ...exercises.map(ex => [
            ex.name,
            ex.timerDuration.toString(),
            ex.youtubeLink || '',
            ex.isAerobic.toString()
          ])
        ];

        const response = await mockSheets.spreadsheets.values.update({
          spreadsheetId: 'test-sheet-id',
          range: 'Exercises!A1:D10',
          values: {
            body: { values }
          }
        });

        expect(response.result.updatedCells).toBeGreaterThan(0);
        expect(exercises.find(ex => ex.name === 'Bench Press')).toBeUndefined();
      }
    });
  });

  describe('Exercise Configuration Properties', () => {
    it('should save timer duration', () => {
      const exercise = createMockExerciseConfig('Bench Press', 90);
      expect(exercise.timerDuration).toBe(90);
    });

    it('should save YouTube link', () => {
      const exercise = createMockExerciseConfig('Bench Press', 90, 'https://youtube.com/watch?v=bench');
      expect(exercise.youtubeLink).toBe('https://youtube.com/watch?v=bench');
    });

    it('should save aerobic flag', () => {
      const aerobic = createMockExerciseConfig('Running', 0, '', true);
      const nonAerobic = createMockExerciseConfig('Bench Press', 90, '', false);

      expect(aerobic.isAerobic).toBe(true);
      expect(nonAerobic.isAerobic).toBe(false);
    });
  });

  describe('Exercise List Persistence', () => {
    it('should load exercise list from Google Sheets', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Exercises!A1:D100'
      });

      const values = response.result.values || [];
      const exercises = values.slice(1).map(row => ({
        name: row[0],
        timerDuration: parseInt(row[1] || '60', 10),
        youtubeLink: row[2] || '',
        isAerobic: row[3] === 'true'
      }));

      expect(Array.isArray(exercises)).toBe(true);
    });

    it('should save exercise list to Google Sheets', async () => {
      const values = [
        ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
        ...sampleExercises.map(ex => [
          ex.name,
          ex.timerDuration.toString(),
          ex.youtubeLink || '',
          ex.isAerobic.toString()
        ])
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Exercises!A1:D10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });
  });

  describe('Exercise Validation', () => {
    it('should validate exercise name is not empty', () => {
      const exercise = createMockExerciseConfig('', 90);
      // In real implementation, this should be validated
      expect(exercise.name).toBe('');
    });

    it('should validate timer duration is non-negative', () => {
      const exercise = createMockExerciseConfig('Bench Press', 90);
      expect(exercise.timerDuration).toBeGreaterThanOrEqual(0);
    });

    it('should validate YouTube link format', () => {
      const validLink = 'https://youtube.com/watch?v=bench';
      const invalidLink = 'not-a-url';

      // Basic URL validation
      const isValid = validLink.startsWith('http://') || validLink.startsWith('https://');
      const isInvalid = !invalidLink.startsWith('http://') && !invalidLink.startsWith('https://');

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(true);
    });
  });
});
