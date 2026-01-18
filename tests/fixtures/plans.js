/**
 * Sample workout plan fixtures
 */

export const samplePlans = [
  {
    id: 'plan-1',
    name: 'Chest Day',
    exerciseSlots: [
      { slotNumber: 1, exerciseName: 'Bench Press' },
      { slotNumber: 2, exerciseName: 'Incline Press' },
      { slotNumber: 3, exerciseName: 'Cable Flyes' }
    ],
    createdAt: '2024-01-01',
    createdBy: 'user@example.com',
    creatorSheetId: 'sheet-123'
  },
  {
    id: 'plan-2',
    name: 'Leg Day',
    exerciseSlots: [
      { slotNumber: 1, exerciseName: 'Squats' },
      { slotNumber: 2, exerciseName: 'Leg Press' },
      { slotNumber: 3, exerciseName: 'Leg Curls' },
      { slotNumber: 4, exerciseName: 'Calf Raises' }
    ],
    createdAt: '2024-01-02',
    createdBy: 'user@example.com',
    creatorSheetId: 'sheet-123'
  },
  {
    id: 'plan-3',
    name: 'Full Body',
    exerciseSlots: [
      { slotNumber: 1, exerciseName: 'Squats' },
      { slotNumber: 2, exerciseName: 'Bench Press' },
      { slotNumber: 3, exerciseName: 'Deadlift' },
      { slotNumber: 4, exerciseName: 'Pull-ups' },
      { slotNumber: 5, exerciseName: 'Overhead Press' }
    ],
    createdAt: '2024-01-03',
    createdBy: 'user@example.com',
    creatorSheetId: 'sheet-123'
  }
];

export const emptyPlan = {
  id: 'plan-empty',
  name: 'Empty Plan',
  exerciseSlots: [],
  createdAt: '2024-01-04',
  createdBy: 'user@example.com',
  creatorSheetId: 'sheet-123'
};

export const singleExercisePlan = {
  id: 'plan-single',
  name: 'Single Exercise',
  exerciseSlots: [
    { slotNumber: 1, exerciseName: 'Running' }
  ],
  createdAt: '2024-01-05',
  createdBy: 'user@example.com',
  creatorSheetId: 'sheet-123'
};
