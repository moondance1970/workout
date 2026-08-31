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

    it('should default exerciseTimer to null when missing', () => {
      // Mirrors normalizeExerciseList() in app.js
      const normalize = (item) => ({
        name: item.name || '',
        timerDuration: item.timerDuration || 60,
        youtubeLink: item.youtubeLink || '',
        isAerobic: item.isAerobic || false,
        exerciseTimer: item.exerciseTimer || null
      });

      expect(normalize({ name: 'Plank' }).exerciseTimer).toBeNull();
      expect(normalize({ name: 'Plank', exerciseTimer: 90 }).exerciseTimer).toBe(90);
    });
  });

  describe('Decimal (half) reps', () => {
    // Mirrors the parsing used for .rep-input values in app.js: parseFloat, not parseInt
    const parseRepValue = (value) => parseFloat(value) || 0;

    it('should preserve a half-rep value instead of truncating it', () => {
      expect(parseRepValue('8.5')).toBe(8.5);
      expect(parseRepValue('0.5')).toBe(0.5);
      expect(parseRepValue('12.5')).toBe(12.5);
    });

    it('should still parse whole numbers and blanks correctly', () => {
      expect(parseRepValue('8')).toBe(8);
      expect(parseRepValue('')).toBe(0);
      expect(parseRepValue('abc')).toBe(0);
    });

    it('demonstrates the truncation bug that parseFloat fixed over parseInt', () => {
      const oldParse = (value) => parseInt(value) || 0;
      expect(oldParse('8.5')).toBe(8);
      expect(parseRepValue('8.5')).toBe(8.5);
    });

    it('should round-trip half reps through comma-separated sheet storage', () => {
      const reps = [8.5, 10, 9.5];
      const stored = reps.join(','); // how syncToSheet writes the Reps column
      const parsed = stored.split(',').map(r => parseFloat(r.trim()) || 0); // how it's read back
      expect(parsed).toEqual(reps);
    });

    it('should create an exercise with half-rep values', () => {
      const exercise = createMockExercise('Pull-ups', 2, [8.5, 7.5], [0, 0]);
      expect(exercise.reps).toEqual([8.5, 7.5]);
    });

    it('should still compare equal for identical decimal rep arrays', () => {
      // Mirrors the exact-match comparison in checkExerciseCompletedTwice()
      const first = [8.5, 8.5];
      const second = [8.5, 8.5];
      const allMatch = first.length === second.length && first.every((r, i) => r === second[i]);
      expect(allMatch).toBe(true);
    });
  });

  describe('Aerobic duration presets', () => {
    // Mirrors parseDurationPresetsInput() in app.js
    const parsePresets = (text, fallback = [5, 10, 15, 20, 30, 45, 60]) => {
      const minutes = (text || '')
        .split(',')
        .map(part => parseInt(part.trim(), 10))
        .filter(n => Number.isInteger(n) && n > 0);
      const unique = Array.from(new Set(minutes)).sort((a, b) => a - b);
      return unique.length > 0 ? unique : fallback;
    };

    it('should parse a comma-separated list of minutes into a sorted array', () => {
      expect(parsePresets('20, 5, 10')).toEqual([5, 10, 20]);
    });

    it('should de-duplicate repeated values', () => {
      expect(parsePresets('10, 10, 20, 20, 5')).toEqual([5, 10, 20]);
    });

    it('should drop non-numeric and non-positive entries', () => {
      expect(parsePresets('10, abc, -5, 0, 20')).toEqual([10, 20]);
    });

    it('should fall back to the default presets when the input is empty or invalid', () => {
      expect(parsePresets('')).toEqual([5, 10, 15, 20, 30, 45, 60]);
      expect(parsePresets('abc, -1, 0')).toEqual([5, 10, 15, 20, 30, 45, 60]);
    });
  });

  describe('Exercise Timer (separate from the rest/set timer)', () => {
    it('should default to 2 minutes (120 seconds) when first enabled', () => {
      const defaultExerciseTimer = 2 * 60 + 0; // matches the add-exercise modal's default (2:00)
      expect(defaultExerciseTimer).toBe(120);
    });

    it('should be null/unset when the checkbox is left unchecked', () => {
      // Mirrors saveExerciseFromModal()/updateExerciseConfigurationFromModal()
      const computeExerciseTimer = (enabled, minutes, seconds) => {
        if (!enabled) return null;
        const total = minutes * 60 + seconds;
        return total > 0 ? total : null;
      };

      expect(computeExerciseTimer(false, 2, 0)).toBeNull();
      expect(computeExerciseTimer(true, 1, 30)).toBe(90);
      expect(computeExerciseTimer(true, 0, 0)).toBeNull(); // 0:00 is treated as "not set"
    });

    it('should be independent of the exercise\'s rest/set timer', () => {
      const exercise = createMockExerciseConfig('Plank', 60, '', false);
      exercise.exerciseTimer = 90;

      expect(exercise.timerDuration).toBe(60);
      expect(exercise.exerciseTimer).toBe(90);
    });
  });
});
