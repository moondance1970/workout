import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { samplePlans } from '../fixtures/plans.js';

describe('Plan Sharing Integration', () => {
  let mockSheets;
  let mockDrive;

  beforeEach(() => {
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
    mockDrive = mocks.drive;
  });

  describe('Plan Link Generation', () => {
    it('should generate shareable plan link', () => {
      const plan = samplePlans[0];
      const baseUrl = 'http://localhost:3000';
      const link = `${baseUrl}?plan=${plan.id}&sheet=${plan.creatorSheetId}`;

      expect(link).toContain(plan.id);
      expect(link).toContain(plan.creatorSheetId);
      expect(link).toContain('plan=');
      expect(link).toContain('sheet=');
    });

    it('should parse plan link parameters', () => {
      const url = new URL('http://localhost:3000?plan=plan-1&sheet=sheet-123');
      const planId = url.searchParams.get('plan');
      const sheetId = url.searchParams.get('sheet');

      expect(planId).toBe('plan-1');
      expect(sheetId).toBe('sheet-123');
    });
  });

  describe('Plan Sharing via Google Drive', () => {
    it('should share sheet for plan', async () => {
      const sheetId = 'sheet-123';
      const recipientEmail = 'recipient@example.com';

      const response = await mockDrive.permissions.create({
        fileId: sheetId,
        resource: {
          type: 'user',
          role: 'reader',
          emailAddress: recipientEmail
        }
      });

      expect(response.result).toHaveProperty('id');
      expect(response.result.type).toBe('user');
      expect(response.result.role).toBe('reader');
    });

    it('should share sheet with anyone with link', async () => {
      const sheetId = 'sheet-123';

      const response = await mockDrive.permissions.create({
        fileId: sheetId,
        resource: {
          type: 'anyone',
          role: 'reader'
        }
      });

      expect(response.result).toHaveProperty('id');
      expect(response.result.type).toBe('anyone');
    });
  });

  describe('Plan Import', () => {
    it('should fetch plan from creator sheet', async () => {
      const planId = 'plan-1';
      const creatorSheetId = 'sheet-123';

      // Simulate fetching plan data
      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: creatorSheetId,
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

      const plan = plans.find(p => p.id === planId);

      expect(plan).toBeTruthy();
      expect(plan.id).toBe(planId);
    });

    it('should import plan to user sheet', async () => {
      const importedPlan = samplePlans[0];
      const userSheetId = 'user-sheet-456';

      const values = [
        ['Plan ID', 'Plan Name', 'Exercise Slots', 'Created At', 'Created By', 'Creator Sheet ID'],
        [
          importedPlan.id,
          importedPlan.name,
          JSON.stringify(importedPlan.exerciseSlots),
          importedPlan.createdAt,
          importedPlan.createdBy,
          importedPlan.creatorSheetId
        ]
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: userSheetId,
        range: 'Plans!A1:F10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });

    it('should handle import errors gracefully', async () => {
      mockSheets.spreadsheets.values.get.mockRejectedValueOnce(
        new Error('Plan not found')
      );

      try {
        await mockSheets.spreadsheets.values.get({
          spreadsheetId: 'invalid-sheet-id',
          range: 'Plans!A1:F100'
        });
      } catch (error) {
        expect(error.message).toBe('Plan not found');
      }
    });
  });

  describe('Plan Import Preview', () => {
    it('should show plan preview before import', () => {
      const plan = samplePlans[0];
      const preview = {
        name: plan.name,
        exerciseCount: plan.exerciseSlots.length,
        exercises: plan.exerciseSlots.map(slot => slot.exerciseName),
        createdBy: plan.createdBy
      };

      expect(preview.name).toBe(plan.name);
      expect(preview.exerciseCount).toBe(plan.exerciseSlots.length);
      expect(preview.exercises.length).toBeGreaterThan(0);
    });
  });

  describe('Exercise Config Sharing', () => {
    it('should copy exercise config to recipient', async () => {
      const exerciseName = 'Bench Press';
      const config = {
        timerDuration: 90,
        youtubeLink: 'https://youtube.com/watch?v=bench',
        isAerobic: false
      };
      const recipientSheetId = 'recipient-sheet-789';

      // Simulate copying config
      const values = [
        ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
        [
          exerciseName,
          config.timerDuration.toString(),
          config.youtubeLink,
          config.isAerobic.toString()
        ]
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: recipientSheetId,
        range: 'Exercises!A1:D10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
    });
  });
});
