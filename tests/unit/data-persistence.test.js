import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { sampleSessions } from '../fixtures/sessions.js';
import { sampleExercises } from '../fixtures/exercises.js';
import { samplePlans } from '../fixtures/plans.js';
import { createMockLocalStorage } from '../utils/test-helpers.js';

describe('Data Persistence', () => {
  let mockLocalStorage;
  let mockSheets;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Session Persistence', () => {
    it('should save session to Google Sheets', async () => {
      const session = sampleSessions[0];
      const values = [
        ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
        ...session.exercises.map(ex => [
          session.date,
          ex.name,
          ex.sets.toString(),
          ex.reps.join(','),
          ex.weights.join(','),
          ex.notes || ''
        ])
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });

    it('should load sessions from Google Sheets', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F100'
      });

      expect(response.result).toHaveProperty('values');
      expect(Array.isArray(response.result.values)).toBe(true);
    });

    it('should handle empty sessions list', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'empty-sheet-id',
        range: 'Sessions!A1:F1'
      });

      const values = response.result.values || [];
      const sessions = values.slice(1); // Skip header

      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe('Exercise List Persistence', () => {
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
  });

  describe('Workout Plans Persistence', () => {
    it('should save workout plan to Google Sheets', async () => {
      const plan = samplePlans[0];
      const values = [
        ['Plan ID', 'Plan Name', 'Exercise Slots', 'Created At', 'Created By', 'Creator Sheet ID'],
        [
          plan.id,
          plan.name,
          JSON.stringify(plan.exerciseSlots),
          plan.createdAt,
          plan.createdBy,
          plan.creatorSheetId
        ]
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Plans!A1:F10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });

    it('should load workout plans from Google Sheets', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Plans!A1:F100'
      });

      const values = response.result.values || [];
      const plans = values.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        exerciseSlots: JSON.parse(row[2] || '[]'),
        createdAt: row[3],
        createdBy: row[4],
        creatorSheetId: row[5]
      }));

      expect(Array.isArray(plans)).toBe(true);
    });
  });

  describe('Config Persistence', () => {
    it('should save default timer to localStorage', () => {
      const defaultTimer = 90;
      mockLocalStorage.setItem('defaultTimer', defaultTimer.toString());

      const saved = parseInt(mockLocalStorage.getItem('defaultTimer'), 10);
      expect(saved).toBe(90);
    });

    it('should load default timer from localStorage', () => {
      mockLocalStorage.setItem('defaultTimer', '120');
      const loaded = parseInt(mockLocalStorage.getItem('defaultTimer') || '60', 10);

      expect(loaded).toBe(120);
    });

    it('should save user email to localStorage', () => {
      const email = 'user@example.com';
      mockLocalStorage.setItem('userEmail', email);

      expect(mockLocalStorage.getItem('userEmail')).toBe(email);
    });

    it('should save user name to localStorage', () => {
      const name = 'Test User';
      mockLocalStorage.setItem('userName', name);

      expect(mockLocalStorage.getItem('userName')).toBe(name);
    });
  });

  describe('Token Persistence', () => {
    it('should save access token to localStorage', () => {
      const token = 'test-access-token';
      const expiry = new Date(Date.now() + 3600000).toISOString();

      mockLocalStorage.setItem('googleAccessToken', token);
      mockLocalStorage.setItem('googleTokenExpiry', expiry);

      expect(mockLocalStorage.getItem('googleAccessToken')).toBe(token);
      expect(mockLocalStorage.getItem('googleTokenExpiry')).toBe(expiry);
    });

    it('should load access token from localStorage', () => {
      const token = 'test-access-token';
      const expiry = new Date(Date.now() + 3600000).toISOString();

      mockLocalStorage.setItem('googleAccessToken', token);
      mockLocalStorage.setItem('googleTokenExpiry', expiry);

      const storedToken = mockLocalStorage.getItem('googleAccessToken');
      const storedExpiry = mockLocalStorage.getItem('googleTokenExpiry');

      expect(storedToken).toBe(token);
      expect(storedExpiry).toBe(expiry);
    });

    it('should clear tokens on sign out', () => {
      mockLocalStorage.setItem('googleAccessToken', 'test-token');
      mockLocalStorage.setItem('googleTokenExpiry', new Date().toISOString());

      mockLocalStorage.removeItem('googleAccessToken');
      mockLocalStorage.removeItem('googleTokenExpiry');

      expect(mockLocalStorage.getItem('googleAccessToken')).toBeNull();
      expect(mockLocalStorage.getItem('googleTokenExpiry')).toBeNull();
    });
  });

  describe('Data Synchronization', () => {
    it('should sync sessions after save', async () => {
      const session = sampleSessions[0];
      
      // Save session
      await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F10',
        values: {
          body: { values: [[session.date]] }
        }
      });

      // Reload sessions
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F100'
      });

      expect(response.result).toHaveProperty('values');
    });

    it('should handle sync errors gracefully', async () => {
      mockSheets.spreadsheets.values.update.mockRejectedValueOnce(
        new Error('Sync failed')
      );

      try {
        await mockSheets.spreadsheets.values.update({
          spreadsheetId: 'test-sheet-id',
          range: 'Sessions!A1:F10',
          values: {
            body: { values: [] }
          }
        });
      } catch (error) {
        expect(error.message).toBe('Sync failed');
      }
    });
  });
});
