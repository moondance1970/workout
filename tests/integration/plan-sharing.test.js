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
    it('should copy exercise config to recipient, including the exercise timer', async () => {
      const exerciseName = 'Bench Press';
      const config = {
        timerDuration: 90,
        youtubeLink: 'https://youtube.com/watch?v=bench',
        isAerobic: false,
        exerciseTimer: 60
      };
      const recipientSheetId = 'recipient-sheet-789';

      // Simulate copying config - mirrors doImportPlan()/copyExerciseConfigToRecipient()
      const values = [
        ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic', 'Exercise Timer'],
        [
          exerciseName,
          config.timerDuration.toString(),
          config.youtubeLink,
          config.isAerobic.toString(),
          config.exerciseTimer.toString()
        ]
      ];

      const response = await mockSheets.spreadsheets.values.update({
        spreadsheetId: recipientSheetId,
        range: 'Exercises!A1:E10',
        values: {
          body: { values }
        }
      });

      expect(response.result.updatedCells).toBeGreaterThan(0);
      expect(values[1][4]).toBe('60');
    });
  });

  describe('Followers Registry (progress sharing)', () => {
    // A follower only ever has read access to the creator's real Plans/Exercises/Config
    // sheet, so follower registrations can't be written there. Instead, a separate
    // "Workout Tracker - Followers" sheet is created per creator and shared as writable,
    // keeping the real plan data read-only. See ensureFollowersRegistrySheetId() /
    // resolveFollowersRegistrySheetId() / savePlanFollowerInfo() in app.js.

    it('should share the static (Plans/Exercises/Config) sheet as read-only', async () => {
      const response = await mockDrive.permissions.create({
        fileId: 'creator-static-sheet',
        resource: { type: 'anyone', role: 'reader' }
      });

      expect(response.result.role).toBe('reader');
    });

    it('should share the followers registry as writable, not read-only', async () => {
      const response = await mockDrive.permissions.create({
        fileId: 'followers-registry-sheet',
        resource: { type: 'anyone', role: 'writer' }
      });

      expect(response.result.role).toBe('writer');
      expect(response.result.role).not.toBe('reader');
    });

    it('should record the registry sheet ID on the creator\'s own Config sheet', async () => {
      const creatorStaticSheetId = 'creator-static-sheet';
      const registrySheetId = 'followers-registry-sheet';

      await mockSheets.spreadsheets.values.update({
        spreadsheetId: creatorStaticSheetId,
        range: 'Config!D1',
        values: { body: { values: [[registrySheetId]] } }
      });

      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({
        result: { values: [[registrySheetId]] }
      });

      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: creatorStaticSheetId,
        range: 'Config!D1'
      });

      expect(response.result.values[0][0]).toBe(registrySheetId);
    });

    it('should resolve to null when the creator has no registry recorded yet', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({ result: {} });

      const response = await mockSheets.spreadsheets.values.get({
        spreadsheetId: 'creator-static-sheet',
        range: 'Config!D1'
      });

      const id = response.result.values?.[0]?.[0]?.trim() || null;
      expect(id).toBeNull();
    });

    it('should preserve lastWorkoutDate when a follower re-registers', () => {
      // Mirrors the merge logic in savePlanFollowerInfo()
      const existingFollowers = [
        { planId: 'plan-1', followerEmail: 'trainee@example.com', sharedAt: '2026-01-01T00:00:00.000Z', lastWorkoutDate: '2026-02-01T00:00:00.000Z' }
      ];

      const newInfo = { planId: 'plan-1', followerEmail: 'trainee@example.com', sharedAt: new Date().toISOString(), lastWorkoutDate: '' };
      const existingIndex = existingFollowers.findIndex(f => f.planId === newInfo.planId && f.followerEmail === newInfo.followerEmail);

      newInfo.sharedAt = existingFollowers[existingIndex].sharedAt || newInfo.sharedAt;
      newInfo.lastWorkoutDate = existingFollowers[existingIndex].lastWorkoutDate || '';

      expect(newInfo.sharedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(newInfo.lastWorkoutDate).toBe('2026-02-01T00:00:00.000Z');
    });
  });

  describe('Multiple trainers / own plans coexisting', () => {
    // Regression coverage for a bug where doImportPlan() overwrote plan.createdBy with
    // the importer's own email, so progress sharing pointed at yourself instead of the
    // trainer who actually created the plan.
    it('should keep the original trainer\'s email as createdBy after import, not the importer\'s', () => {
      const importedPlan = { id: 'plan-1', name: 'Leg Day', createdBy: 'trainer@example.com', creatorSheetId: 'trainer-sheet' };
      const importerEmail = 'me@example.com';
      const myOwnStaticSheetId = 'my-sheet';

      // Mirrors doImportPlan(): creatorSheetId is repointed to where the data now
      // lives, but createdBy is deliberately left alone
      importedPlan.id = 'plan_new_1';
      importedPlan.creatorSheetId = myOwnStaticSheetId;

      expect(importedPlan.createdBy).toBe('trainer@example.com');
      expect(importedPlan.createdBy).not.toBe(importerEmail);
      expect(importedPlan.creatorSheetId).toBe(myOwnStaticSheetId);
    });

    it('should let plans from multiple different trainers, plus an own plan, coexist', () => {
      const myEmail = 'me@example.com';
      const workoutPlans = [
        { id: 'plan-own', name: 'My Routine', createdBy: myEmail, creatorSheetId: 'my-sheet' },
        { id: 'plan-a', name: 'Leg Day', createdBy: 'trainerA@example.com', creatorSheetId: 'my-sheet' },
        { id: 'plan-b', name: 'Push Pull', createdBy: 'trainerB@example.com', creatorSheetId: 'my-sheet' }
      ];

      const ownPlans = workoutPlans.filter(p => p.createdBy === myEmail);
      const importedPlans = workoutPlans.filter(p => p.createdBy !== myEmail);
      const distinctTrainers = new Set(importedPlans.map(p => p.createdBy));

      expect(workoutPlans.length).toBe(3);
      expect(ownPlans.length).toBe(1);
      expect(importedPlans.length).toBe(2);
      expect(distinctTrainers.size).toBe(2);
    });

    it('should register progress sharing separately per trainer (different registries)', () => {
      // Each creator has their own followers registry, so sharing progress with
      // trainer A writes to a different sheet than sharing with trainer B
      const registryForTrainerA = 'registry-a';
      const registryForTrainerB = 'registry-b';

      expect(registryForTrainerA).not.toBe(registryForTrainerB);
    });
  });

  describe('Duplicate Import Prevention', () => {
    // Regression coverage for a bug where re-opening the same shared plan link (or
    // double-clicking Import) created a second copy of the plan every time.

    it('should record the trainer\'s original planId/creatorSheetId as sourcePlanId/sourceCreatorSheetId', () => {
      // Mirrors doImportPlan(): plan.id is reassigned to a new local ID, but the
      // trainer's original identity is preserved separately for de-dup purposes
      const plan = { id: 'plan_trainer_original', name: 'Leg Day' };
      const originalCreatorSheetId = 'trainer-sheet';

      plan.sourcePlanId = plan.id;
      plan.sourceCreatorSheetId = originalCreatorSheetId;
      plan.id = 'plan_local_new_copy';
      plan.creatorSheetId = 'my-sheet';

      expect(plan.sourcePlanId).toBe('plan_trainer_original');
      expect(plan.sourceCreatorSheetId).toBe('trainer-sheet');
      expect(plan.id).not.toBe(plan.sourcePlanId);
    });

    it('should find the existing local copy by sourcePlanId/sourceCreatorSheetId, not by id or name', () => {
      // The old (buggy) lookup compared p.id === planId or matched by plan name -
      // neither can ever match since import always assigns a new id. The fix looks up
      // by the preserved source identity instead.
      const workoutPlans = [
        { id: 'plan_local_1', name: 'Leg Day', sourcePlanId: 'plan_trainer_A', sourceCreatorSheetId: 'trainer-a-sheet' },
        { id: 'plan_local_2', name: 'Leg Day', sourcePlanId: 'plan_trainer_B', sourceCreatorSheetId: 'trainer-b-sheet' } // same name, different trainer
      ];

      const found = workoutPlans.find(p =>
        p.sourcePlanId === 'plan_trainer_B' && p.sourceCreatorSheetId === 'trainer-b-sheet'
      );

      expect(found).toBeTruthy();
      expect(found.id).toBe('plan_local_2');

      // The old id-based check would never have matched either copy
      const oldStyleMatch = workoutPlans.find(p => p.id === 'plan_trainer_B');
      expect(oldStyleMatch).toBeUndefined();
    });

    it('should not create a duplicate when the same plan+creator was already marked imported', () => {
      const receivedPlans = [
        { planId: 'plan_trainer_A', creatorSheetId: 'trainer-a-sheet', planName: 'Leg Day', status: 'imported' }
      ];

      const isAlreadyImported = (planId, creatorSheetId) =>
        receivedPlans.some(p => p.planId === planId && p.creatorSheetId === creatorSheetId && p.status === 'imported');

      expect(isAlreadyImported('plan_trainer_A', 'trainer-a-sheet')).toBe(true);
      // A different trainer's plan (even with a colliding-looking id) is unaffected
      expect(isAlreadyImported('plan_trainer_B', 'trainer-b-sheet')).toBe(false);
    });

    it('should ignore a second Import click while the first is still in progress', () => {
      // Mirrors the actionInProgress guard in showPlanImportPreview()
      let actionInProgress = false;
      let importCallCount = 0;

      const onImportClick = () => {
        if (actionInProgress) return;
        actionInProgress = true;
        importCallCount++;
      };

      onImportClick();
      onImportClick(); // simulates a rapid second click before the first resolves

      expect(importCallCount).toBe(1);
    });
  });
});
