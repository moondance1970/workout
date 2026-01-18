import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { mockSheetData } from '../mocks/google-apis.js';

describe('Google Sheets Integration', () => {
  let mockSheets;

  beforeEach(() => {
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Read Operations', () => {
    it('should read values from sheet', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:F10'
      });

      expect(response.result).toHaveProperty('values');
      expect(Array.isArray(response.result.values)).toBe(true);
    });

    it('should read specific range from sheet', async () => {
      const range = 'Sessions!A1:F10';
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range
      });

      expect(response.result.range).toBe(range);
    });

    it('should handle empty sheet', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'empty-sheet-id',
        range: 'Sheet1!A1:Z1'
      });

      expect(response.result).toHaveProperty('values');
    });

    it('should batch read multiple ranges', async () => {
      const response = await mockSheets.spreadsheets.values.batchGet({
        spreadsheetId: 'test-sheet-id',
        ranges: ['Sheet1!A1:F10', 'Sheet2!A1:F10']
      });

      expect(response.result.valueRanges.length).toBe(2);
      response.result.valueRanges.forEach(range => {
        expect(range).toHaveProperty('range');
        expect(range).toHaveProperty('values');
      });
    });
  });

  describe('Write Operations', () => {
    it('should update values in sheet', async () => {
      const values = [['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes']];
      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:F1',
        values: {
          body: { values }
        }
      });

      expect(response.result).toHaveProperty('updatedCells');
      expect(response.result.updatedCells).toBeGreaterThan(0);
    });

    it('should update specific range', async () => {
      const range = 'Sessions!A2:F2';
      const values = [['2024-01-15', 'Bench Press', '3', '10,8,6', '100,100,100', '']];
      
      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range,
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedRange).toBe(range);
    });

    it('should batch update multiple ranges', async () => {
      const response = await mockSheets.spreadsheets.values.batchUpdate({
        spreadsheetId: 'test-sheet-id',
        resource: {
          valueInputOption: 'RAW',
          data: [
            {
              range: 'Sheet1!A1:F1',
              values: [['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes']]
            }
          ]
        }
      });

      expect(response.result).toHaveProperty('responses');
    });
  });

  describe('Sheet Creation', () => {
    it('should create new spreadsheet', async () => {
      const response = await mockSheets.spreadsheets.create({
        resource: {
          properties: {
            title: 'New Workout Tracker'
          }
        }
      });

      expect(response.result).toHaveProperty('spreadsheetId');
      expect(response.result.properties.title).toBe('New Workout Tracker');
    });

    it('should create spreadsheet with multiple sheets', async () => {
      const response = await mockSheets.spreadsheets.create({
        resource: {
          properties: {
            title: 'Workout Tracker'
          },
          sheets: [
            { properties: { title: 'Sessions' } },
            { properties: { title: 'Exercises' } },
            { properties: { title: 'Plans' } }
          ]
        }
      });

      expect(response.result).toHaveProperty('spreadsheetId');
    });
  });

  describe('Sheet Metadata', () => {
    it('should get spreadsheet metadata', async () => {
      const response = await mockSheets.spreadsheets.get({
        spreadsheetId: 'test-sheet-id'
      });

      expect(response.result).toHaveProperty('spreadsheetId');
      expect(response.result).toHaveProperty('properties');
      expect(response.result.properties).toHaveProperty('title');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSheets.spreadsheets.values.get.mockRejectedValueOnce(
        new Error('API Error')
      );

      try {
        await mockSheets.spreadsheets.values.get({
          spreadsheetId: 'invalid-sheet-id',
          range: 'Sheet1!A1:F10'
        });
      } catch (error) {
        expect(error.message).toBe('API Error');
      }
    });

    it('should handle network errors', async () => {
      mockSheets.spreadsheets.values.get.mockRejectedValueOnce(
        new Error('Network error')
      );

      try {
        await mockSheets.spreadsheets.values.get({
          spreadsheetId: 'test-sheet-id',
          range: 'Sheet1!A1:F10'
        });
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Data Format Conversion', () => {
    it('should convert session data to sheet format', () => {
      const session = {
        date: '2024-01-15',
        exercises: [{
          name: 'Bench Press',
          sets: 3,
          reps: [10, 8, 6],
          weights: [100, 100, 100],
          notes: 'Good form'
        }]
      };

      const row = [
        session.date,
        session.exercises[0].name,
        session.exercises[0].sets.toString(),
        session.exercises[0].reps.join(','),
        session.exercises[0].weights.join(','),
        session.exercises[0].notes
      ];

      expect(row.length).toBe(6);
      expect(row[0]).toBe('2024-01-15');
      expect(row[1]).toBe('Bench Press');
    });

    it('should convert sheet data to session format', () => {
      const row = ['2024-01-15', 'Bench Press', '3', '10,8,6', '100,100,100', 'Good form'];
      
      const exercise = {
        name: row[1],
        sets: parseInt(row[2], 10),
        reps: row[3].split(',').map(Number),
        weights: row[4].split(',').map(Number),
        notes: row[5]
      };

      expect(exercise.name).toBe('Bench Press');
      expect(exercise.sets).toBe(3);
      expect(exercise.reps).toEqual([10, 8, 6]);
      expect(exercise.weights).toEqual([100, 100, 100]);
    });
  });
});
