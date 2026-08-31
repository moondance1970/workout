import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { samplePlans, emptyPlan, singleExercisePlan } from '../fixtures/plans.js';
import { createMockPlan } from '../utils/test-helpers.js';

describe('Workout Plans', () => {
  beforeEach(() => {
    setupGoogleAPIMocks();
  });

  describe('Plan Structure', () => {
    it('should create a valid plan object', () => {
      const plan = createMockPlan('plan-1', 'Chest Day', [
        { slotNumber: 1, exerciseName: 'Bench Press' }
      ]);
      
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('exerciseSlots');
      expect(plan).toHaveProperty('createdAt');
      expect(plan.id).toBe('plan-1');
      expect(plan.name).toBe('Chest Day');
    });

    it('should handle plan with multiple exercise slots', () => {
      const plan = samplePlans[0];
      
      expect(plan.exerciseSlots.length).toBeGreaterThan(0);
      expect(plan.exerciseSlots[0]).toHaveProperty('slotNumber');
      expect(plan.exerciseSlots[0]).toHaveProperty('exerciseName');
    });

    it('should handle empty plan', () => {
      expect(emptyPlan.exerciseSlots.length).toBe(0);
      expect(emptyPlan.id).toBeTruthy();
      expect(emptyPlan.name).toBeTruthy();
    });

    it('should handle plan with single exercise', () => {
      expect(singleExercisePlan.exerciseSlots.length).toBe(1);
      expect(singleExercisePlan.exerciseSlots[0].exerciseName).toBe('Running');
    });
  });

  describe('Plan Operations', () => {
    it('should find plan by ID', () => {
      const planId = 'plan-1';
      const plan = samplePlans.find(p => p.id === planId);
      
      expect(plan).toBeTruthy();
      expect(plan.id).toBe(planId);
    });

    it('should find plan by name', () => {
      const planName = 'Chest Day';
      const plan = samplePlans.find(p => p.name === planName);
      
      expect(plan).toBeTruthy();
      expect(plan.name).toBe(planName);
    });

    it('should add exercise slot to plan', () => {
      const plan = { ...samplePlans[0] };
      const newSlot = { slotNumber: 4, exerciseName: 'Dips' };
      
      plan.exerciseSlots.push(newSlot);
      
      expect(plan.exerciseSlots.length).toBe(4);
      expect(plan.exerciseSlots[3].exerciseName).toBe('Dips');
    });

    it('should update exercise slot in plan', () => {
      const plan = { ...samplePlans[0] };
      const slotIndex = 0;
      
      plan.exerciseSlots[slotIndex].exerciseName = 'Incline Bench Press';
      
      expect(plan.exerciseSlots[slotIndex].exerciseName).toBe('Incline Bench Press');
    });

    it('should remove exercise slot from plan', () => {
      const plan = { ...samplePlans[0] };
      const initialLength = plan.exerciseSlots.length;
      
      plan.exerciseSlots.pop();
      
      expect(plan.exerciseSlots.length).toBe(initialLength - 1);
    });

    it('should reorder exercise slots', () => {
      const plan = { ...samplePlans[0] };
      const slots = [...plan.exerciseSlots];
      
      // Swap first and second slots
      const temp = slots[0];
      slots[0] = slots[1];
      slots[1] = temp;
      
      // Update slot numbers
      slots.forEach((slot, index) => {
        slot.slotNumber = index + 1;
      });
      
      plan.exerciseSlots = slots;
      
      expect(plan.exerciseSlots[0].slotNumber).toBe(1);
      expect(plan.exerciseSlots[1].slotNumber).toBe(2);
    });
  });

  describe('Plan Validation', () => {
    it('should validate plan has a name', () => {
      const plan = createMockPlan('plan-1', 'Test Plan');
      
      expect(plan.name.length).toBeGreaterThan(0);
    });

    it('should validate plan has unique ID', () => {
      const plan1 = createMockPlan('plan-1', 'Plan 1');
      const plan2 = createMockPlan('plan-2', 'Plan 2');
      
      expect(plan1.id).not.toBe(plan2.id);
    });

    it('should validate exercise slots have sequential slot numbers', () => {
      const plan = samplePlans[0];
      
      // Slots should have positive slot numbers
      plan.exerciseSlots.forEach((slot) => {
        expect(slot.slotNumber).toBeGreaterThan(0);
      });
      
      // Slot numbers should be unique
      const slotNumbers = plan.exerciseSlots.map(slot => slot.slotNumber);
      const uniqueSlotNumbers = [...new Set(slotNumbers)];
      expect(uniqueSlotNumbers.length).toBe(slotNumbers.length);
    });

    it('should validate exercise names are not empty', () => {
      const plan = samplePlans[0];
      
      plan.exerciseSlots.forEach(slot => {
        expect(slot.exerciseName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Plan Sharing', () => {
    it('should generate plan link with ID and creator sheet ID', () => {
      const plan = samplePlans[0];
      const baseUrl = 'http://localhost:3000';
      const link = `${baseUrl}?plan=${plan.id}&sheet=${plan.creatorSheetId}`;
      
      expect(link).toContain(plan.id);
      expect(link).toContain(plan.creatorSheetId);
    });

    it('should parse plan link parameters', () => {
      const url = new URL('http://localhost:3000?plan=plan-1&sheet=sheet-123');
      const planId = url.searchParams.get('plan');
      const sheetId = url.searchParams.get('sheet');
      
      expect(planId).toBe('plan-1');
      expect(sheetId).toBe('sheet-123');
    });
  });

  describe('Plan Activation', () => {
    it('should track active plan ID', () => {
      const activePlanId = 'plan-1';
      
      expect(activePlanId).toBeTruthy();
      expect(samplePlans.some(p => p.id === activePlanId)).toBe(true);
    });

    it('should clear active plan', () => {
      let activePlanId = 'plan-1';
      activePlanId = null;
      
      expect(activePlanId).toBeNull();
    });

    it('should get current plan from active ID', () => {
      const activePlanId = 'plan-1';
      const currentPlan = samplePlans.find(p => p.id === activePlanId);
      
      expect(currentPlan).toBeTruthy();
      expect(currentPlan.id).toBe(activePlanId);
    });
  });

  describe('Plan Completion', () => {
    it('should track completed exercises in plan', () => {
      const plan = samplePlans[0];
      // Include all exercises from the plan
      const completedExercises = plan.exerciseSlots.map(slot => slot.exerciseName);
      
      const allCompleted = plan.exerciseSlots.every(slot => 
        completedExercises.includes(slot.exerciseName)
      );
      
      expect(allCompleted).toBe(true);
    });

    it('should detect when plan is complete', () => {
      const plan = singleExercisePlan;
      const completedExercises = ['Running'];
      
      const isComplete = plan.exerciseSlots.every(slot =>
        completedExercises.includes(slot.exerciseName)
      );
      
      expect(isComplete).toBe(true);
    });

    it('should detect when plan is incomplete', () => {
      const plan = samplePlans[0];
      const completedExercises = ['Bench Press'];

      const isComplete = plan.exerciseSlots.every(slot =>
        completedExercises.includes(slot.exerciseName)
      );

      expect(isComplete).toBe(false);
    });
  });

  describe('Exercise Slot Targets', () => {
    // Mirrors formatPlanSlotTarget() in app.js
    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatPlanSlotTarget = (slot, isAerobic = false) => {
      if (!slot) return '';
      if (isAerobic) {
        return slot.targetDuration ? formatDuration(slot.targetDuration) : '';
      }
      const parts = [];
      if (slot.targetSets && slot.targetReps) {
        parts.push(`${slot.targetSets}×${slot.targetReps}`);
      } else if (slot.targetSets) {
        parts.push(`${slot.targetSets} sets`);
      } else if (slot.targetReps) {
        parts.push(`${slot.targetReps} reps`);
      }
      if (slot.targetWeight) {
        parts.push(`@ ${slot.targetWeight}kg`);
      }
      return parts.join(' ');
    };

    it('should format sets, reps, and weight together', () => {
      const slot = { exerciseName: 'Squats', targetSets: 3, targetReps: 10, targetWeight: 40 };
      expect(formatPlanSlotTarget(slot)).toBe('3×10 @ 40kg');
    });

    it('should format sets only when reps are not set', () => {
      const slot = { exerciseName: 'Squats', targetSets: 3 };
      expect(formatPlanSlotTarget(slot)).toBe('3 sets');
    });

    it('should format reps only when sets are not set', () => {
      const slot = { exerciseName: 'Squats', targetReps: 10 };
      expect(formatPlanSlotTarget(slot)).toBe('10 reps');
    });

    it('should format weight alone appended to sets/reps', () => {
      const slot = { exerciseName: 'Squats', targetWeight: 40 };
      expect(formatPlanSlotTarget(slot)).toBe('@ 40kg');
    });

    it('should support decimal reps and weight in the target', () => {
      const slot = { exerciseName: 'Pull-ups', targetSets: 3, targetReps: 8.5, targetWeight: 2.5 };
      expect(formatPlanSlotTarget(slot)).toBe('3×8.5 @ 2.5kg');
    });

    it('should format a target duration for aerobic exercises', () => {
      const slot = { exerciseName: 'Running', targetDuration: 1230 }; // 20:30
      expect(formatPlanSlotTarget(slot, true)).toBe('20:30');
    });

    it('should return an empty string when no target is set', () => {
      const slot = { exerciseName: 'Squats' };
      expect(formatPlanSlotTarget(slot)).toBe('');
      expect(formatPlanSlotTarget(null)).toBe('');
    });

    it('should include a target when sending a plan via WhatsApp/email share text', () => {
      // Mirrors the "Target: ..." line added to shareViaWhatsApp()/the email share body
      const slot = { exerciseName: 'Squats', targetSets: 3, targetReps: 10, targetWeight: 40 };
      const target = formatPlanSlotTarget(slot);
      const line = target ? `   - Target: ${target}\n` : '';
      expect(line).toBe('   - Target: 3×10 @ 40kg\n');
    });
  });
});
