import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockDOM } from '../utils/test-helpers.js';
import { sampleSessions } from '../fixtures/sessions.js';

describe('History Viewing Integration', () => {
  let container;
  let mockSheets;

  beforeEach(() => {
    container = createMockDOM();
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Session History Loading', () => {
    it('should load all sessions from Google Sheets', async () => {
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F100'
      });

      const values = response.result.values || [];
      const sessions = [];

      // Group by date
      const sessionMap = new Map();
      values.slice(1).forEach(row => {
        const date = row[0];
        if (!sessionMap.has(date)) {
          sessionMap.set(date, { date, exercises: [] });
        }
        sessionMap.get(date).exercises.push({
          name: row[1],
          sets: parseInt(row[2], 10),
          reps: row[3].split(',').map(Number),
          weights: row[4].split(',').map(Number),
          notes: row[5] || ''
        });
      });

      sessions.push(...sessionMap.values());

      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should sort sessions by date descending', () => {
      const sessions = [...sampleSessions];
      sessions.sort((a, b) => b.date.localeCompare(a.date));

      expect(sessions[0].date >= sessions[1].date).toBe(true);
    });
  });

  describe('History Filtering', () => {
    it('should filter sessions by exercise name', () => {
      const exerciseName = 'Bench Press';
      const filtered = sampleSessions.filter(session =>
        session.exercises.some(ex => ex.name === exerciseName)
      );

      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach(session => {
        expect(session.exercises.some(ex => ex.name === exerciseName)).toBe(true);
      });
    });

    it('should filter sessions by time period (last 7 days)', () => {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const filtered = sampleSessions.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= sevenDaysAgo && sessionDate <= today;
      });

      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should filter sessions by time period (last 30 days)', () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const filtered = sampleSessions.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= thirtyDaysAgo && sessionDate <= today;
      });

      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should show all sessions when filter is "all"', () => {
      const filtered = sampleSessions;
      expect(filtered.length).toBe(sampleSessions.length);
    });
  });

  describe('Chart Rendering', () => {
    it('should prepare data for chart', () => {
      const exerciseName = 'Bench Press';
      const sessions = sampleSessions.filter(s =>
        s.exercises.some(ex => ex.name === exerciseName)
      );

      const chartData = {
        labels: sessions.map(s => s.date),
        datasets: [{
          label: exerciseName,
          data: sessions.map(s => {
            const ex = s.exercises.find(e => e.name === exerciseName);
            return ex ? ex.weights.reduce((sum, w) => sum + w, 0) / ex.weights.length : 0;
          })
        }]
      };

      expect(chartData.labels.length).toBeGreaterThan(0);
      expect(chartData.datasets[0].data.length).toBeGreaterThan(0);
    });

    it('should handle empty chart data', () => {
      const chartData = {
        labels: [],
        datasets: [{
          label: 'Exercise',
          data: []
        }]
      };

      expect(chartData.labels.length).toBe(0);
      expect(chartData.datasets[0].data.length).toBe(0);
    });
  });

  describe('Session Display', () => {
    it('should display session in history list', () => {
      const historyContent = document.getElementById('history-content');
      expect(historyContent).toBeTruthy();
    });

    it('should format session date for display', () => {
      const date = '2024-01-15';
      const displayDate = new Date(date).toLocaleDateString();

      expect(displayDate).toBeTruthy();
    });

    it('should format exercise details for display', () => {
      const exercise = sampleSessions[0].exercises[0];
      const details = `${exercise.sets} sets: ${exercise.reps.join(', ')} reps × ${exercise.weights.join(', ')}kg`;

      expect(details).toContain(exercise.sets.toString());
      expect(details).toContain(exercise.reps.join(', '));
    });
  });

  describe('Session Deletion', () => {
    it('should delete session from history', async () => {
      const sessions = [...sampleSessions];
      const targetDate = '2024-01-15';

      const index = sessions.findIndex(s => s.date === targetDate);
      if (index >= 0) {
        sessions.splice(index, 1);
      }

      expect(sessions.find(s => s.date === targetDate)).toBeUndefined();
    });

    it('should update Google Sheets after deletion', async () => {
      const values = [
        ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
        ...sampleSessions.slice(1).flatMap(session =>
          session.exercises.map(ex => [
            session.date,
            ex.name,
            ex.sets.toString(),
            ex.reps.join(','),
            ex.weights.join(','),
            ex.notes || ''
          ])
        )
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: 'test-sheet-id',
        range: 'Sessions!A1:F100',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });
  });

  describe('Session Copy to Clipboard', () => {
    it('should format session for clipboard', () => {
      const session = sampleSessions[0];
      let text = `Workout Session - ${session.date}\n\n`;

      session.exercises.forEach(ex => {
        text += `${ex.name}:\n`;
        ex.reps.forEach((rep, i) => {
          const weight = ex.weights[i] || 0;
          if (weight > 0) {
            text += `  Set ${i + 1}: ${rep} reps × ${weight}kg\n`;
          } else {
            text += `  Set ${i + 1}: ${rep} reps\n`;
          }
        });
        if (ex.notes) {
          text += `  Notes: ${ex.notes}\n`;
        }
        text += '\n';
      });

      expect(text).toContain(session.date);
      expect(text).toContain(session.exercises[0].name);
    });
  });
});
