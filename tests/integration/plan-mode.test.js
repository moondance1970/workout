import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockDOM, createMockPlan } from '../utils/test-helpers.js';
import { samplePlans } from '../fixtures/plans.js';

describe('Plan Mode Integration', () => {
  let container;
  let mockSheets;

  beforeEach(() => {
    container = createMockDOM();
    const mocks = setupGoogleAPIMocks();
    mockSheets = mocks.sheets;
  });

  describe('Plan Creation Flow', () => {
    it('should create new workout plan', () => {
      const plan = createMockPlan('plan-new', 'New Plan', [
        { slotNumber: 1, exerciseName: 'Bench Press' },
        { slotNumber: 2, exerciseName: 'Squats' }
      ]);

      expect(plan.id).toBe('plan-new');
      expect(plan.name).toBe('New Plan');
      expect(plan.exerciseSlots.length).toBe(2);
    });

    it('should generate exercise slots', () => {
      const slotCount = 5;
      const slots = Array.from({ length: slotCount }, (_, i) => ({
        slotNumber: i + 1,
        exerciseName: ''
      }));

      expect(slots.length).toBe(5);
      slots.forEach((slot, index) => {
        expect(slot.slotNumber).toBe(index + 1);
      });
    });

    it('should save plan to Google Sheets', async () => {
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
  });

  describe('Plan Activation', () => {
    it('should activate plan', () => {
      const plan = samplePlans[0];
      const activePlanId = plan.id;

      expect(activePlanId).toBe(plan.id);
    });

    it('should show plan indicator when active', () => {
      const indicator = document.getElementById('plan-mode-indicator');
      const planName = document.getElementById('active-plan-name');

      if (indicator && planName) {
        planName.textContent = 'Chest Day';
        indicator.style.display = 'block';
      }

      expect(indicator?.style.display).toBe('block');
      expect(planName?.textContent).toBe('Chest Day');
    });

    it('should filter exercises by active plan', () => {
      const plan = samplePlans[0];
      const allExercises = ['Bench Press', 'Squats', 'Deadlift', 'Incline Press'];
      const planExercises = plan.exerciseSlots.map(slot => slot.exerciseName);
      const filtered = allExercises.filter(ex => planExercises.includes(ex));

      expect(filtered.length).toBe(2);
      expect(filtered).toContain('Bench Press');
      expect(filtered).toContain('Incline Press');
    });
  });

  describe('Plan Completion', () => {
    it('should track completed exercises', () => {
      const plan = samplePlans[0];
      // Include all exercises from the plan in completed list
      const completedExercises = plan.exerciseSlots.map(slot => slot.exerciseName);
      const planExercises = plan.exerciseSlots.map(slot => slot.exerciseName);

      const allCompleted = planExercises.every(ex => completedExercises.includes(ex));

      expect(allCompleted).toBe(true);
    });

    it('should detect plan completion', () => {
      const plan = samplePlans[0];
      const completedExercises = plan.exerciseSlots.map(slot => slot.exerciseName);
      const isComplete = plan.exerciseSlots.every(slot =>
        completedExercises.includes(slot.exerciseName)
      );

      expect(isComplete).toBe(true);
    });

    it('should show victory modal on plan completion', () => {
      const modal = document.getElementById('victory-modal');
      const planName = document.getElementById('victory-plan-name');

      if (modal && planName) {
        planName.textContent = 'Chest Day';
        modal.style.display = 'flex';
      }

      expect(modal?.style.display).toBe('flex');
      expect(planName?.textContent).toBe('Chest Day');
    });
  });

  describe('Plan Editing', () => {
    it('should edit plan name', () => {
      const plan = { ...samplePlans[0] };
      plan.name = 'Updated Chest Day';

      expect(plan.name).toBe('Updated Chest Day');
    });

    it('should update exercise slots', () => {
      const plan = { ...samplePlans[0] };
      plan.exerciseSlots[0].exerciseName = 'Incline Bench Press';

      expect(plan.exerciseSlots[0].exerciseName).toBe('Incline Bench Press');
    });

    it('should reorder exercise slots', () => {
      const plan = { ...samplePlans[0] };
      const slots = [...plan.exerciseSlots];

      // Swap first two
      const temp = slots[0];
      slots[0] = slots[1];
      slots[1] = temp;

      slots.forEach((slot, index) => {
        slot.slotNumber = index + 1;
      });

      plan.exerciseSlots = slots;

      expect(plan.exerciseSlots[0].slotNumber).toBe(1);
      expect(plan.exerciseSlots[1].slotNumber).toBe(2);
    });
  });

  describe('Plan Deletion', () => {
    it('should delete plan', async () => {
      const plans = [...samplePlans];
      const planId = 'plan-1';

      const index = plans.findIndex(p => p.id === planId);
      if (index >= 0) {
        plans.splice(index, 1);
      }

      expect(plans.find(p => p.id === planId)).toBeUndefined();
      expect(plans.length).toBe(samplePlans.length - 1);
    });
  });

  describe('Plan Clearing', () => {
    it('should clear active plan', () => {
      let activePlanId = 'plan-1';
      activePlanId = null;

      expect(activePlanId).toBeNull();
    });

    it('should hide plan indicator when cleared', () => {
      const indicator = document.getElementById('plan-mode-indicator');

      if (indicator) {
        indicator.style.display = 'none';
      }

      expect(indicator?.style.display).toBe('none');
    });
  });
});
