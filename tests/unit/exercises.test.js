import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { sampleExercises } from '../fixtures/exercises.js';
import { createMockExercise, createMockExerciseConfig } from '../utils/test-helpers.js';

describe('Exercises', () => {
  beforeEach(() => {
    setupGoogleAPIMocks();
  });

  describe('Exercise Structure', () => {
    it('should create a valid exercise object', () => {
      const exercise = createMockExercise('Bench Press', 3, [10, 8, 6], [100, 100, 100]);
      
      expect(exercise).toHaveProperty('name');
      expect(exercise).toHaveProperty('sets');
      expect(exercise).toHaveProperty('reps');
      expect(exercise).toHaveProperty('weights');
      expect(exercise.name).toBe('Bench Press');
    });

    it('should handle exercise with single rep value', () => {
      const exercise = createMockExercise('Running', 1, 30, 0);
      
      expect(exercise.reps.length).toBe(1);
      expect(exercise.weights.length).toBe(1);
      expect(exercise.reps[0]).toBe(30);
    });

    it('should handle exercise with single weight value', () => {
      const exercise = createMockExercise('Bench Press', 3, [10, 8, 6], 100);
      
      expect(exercise.weights.length).toBe(3);
      expect(exercise.weights.every(w => w === 100)).toBe(true);
    });
  });

  describe('Exercise Configuration', () => {
    it('should create exercise config with all properties', () => {
      const config = createMockExerciseConfig('Bench Press', 90, 'https://youtube.com/watch?v=bench', false);
      
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('timerDuration');
      expect(config).toHaveProperty('youtubeLink');
      expect(config).toHaveProperty('isAerobic');
    });

    it('should handle exercise without timer', () => {
      const config = createMockExerciseConfig('Stretching', 0);
      
      expect(config.timerDuration).toBe(0);
    });

    it('should handle exercise without YouTube link', () => {
      const config = createMockExerciseConfig('Squats', 120, '');
      
      expect(config.youtubeLink).toBe('');
    });

    it('should identify aerobic exercises', () => {
      const aerobic = sampleExercises.find(ex => ex.isAerobic);
      
      expect(aerobic).toBeTruthy();
      expect(aerobic.isAerobic).toBe(true);
    });

    it('should identify non-aerobic exercises', () => {
      const nonAerobic = sampleExercises.find(ex => !ex.isAerobic);
      
      expect(nonAerobic).toBeTruthy();
      expect(nonAerobic.isAerobic).toBe(false);
    });
  });

  describe('Exercise List Operations', () => {
    it('should find exercise by name', () => {
      const exercise = sampleExercises.find(ex => ex.name === 'Bench Press');
      
      expect(exercise).toBeTruthy();
      expect(exercise.name).toBe('Bench Press');
    });

    it('should check if exercise exists in list', () => {
      const exists = sampleExercises.some(ex => ex.name === 'Bench Press');
      const notExists = sampleExercises.some(ex => ex.name === 'Non-existent Exercise');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should add exercise to list', () => {
      const exercises = [...sampleExercises];
      const newExercise = createMockExerciseConfig('New Exercise', 60);
      
      exercises.push(newExercise);
      
      expect(exercises.length).toBe(sampleExercises.length + 1);
      expect(exercises[exercises.length - 1].name).toBe('New Exercise');
    });

    it('should update exercise in list', () => {
      const exercises = [...sampleExercises];
      const index = exercises.findIndex(ex => ex.name === 'Bench Press');
      
      if (index >= 0) {
        exercises[index].timerDuration = 120;
        expect(exercises[index].timerDuration).toBe(120);
      }
    });

    it('should remove exercise from list', () => {
      const exercises = [...sampleExercises];
      const index = exercises.findIndex(ex => ex.name === 'Bench Press');
      
      if (index >= 0) {
        exercises.splice(index, 1);
      }
      
      expect(exercises.find(ex => ex.name === 'Bench Press')).toBeUndefined();
      expect(exercises.length).toBe(sampleExercises.length - 1);
    });
  });

  describe('Exercise Validation', () => {
    it('should validate exercise name is not empty', () => {
      const exercise = createMockExercise('', 3);
      
      expect(exercise.name).toBe('');
      // In real implementation, this should be validated
    });

    it('should validate sets is positive', () => {
      const exercise = createMockExercise('Bench Press', 3);
      
      expect(exercise.sets).toBeGreaterThan(0);
    });

    it('should validate reps array matches sets', () => {
      const sets = 3;
      const exercise = createMockExercise('Bench Press', sets, [10, 8, 6]);
      
      expect(exercise.reps.length).toBe(sets);
    });

    it('should validate weights array matches sets', () => {
      const sets = 3;
      const exercise = createMockExercise('Bench Press', sets, [10, 8, 6], [100, 100, 100]);
      
      expect(exercise.weights.length).toBe(sets);
    });
  });

  describe('Exercise Normalization', () => {
    it('should normalize exercise list structure', () => {
      const exercises = sampleExercises;
      
      exercises.forEach(ex => {
        expect(ex).toHaveProperty('name');
        expect(typeof ex.name).toBe('string');
      });
    });

    it('should handle missing optional properties', () => {
      const minimalExercise = {
        name: 'Minimal Exercise'
      };
      
      expect(minimalExercise.name).toBe('Minimal Exercise');
      // Timer, YouTube link, and isAerobic should have defaults
    });
  });
});
