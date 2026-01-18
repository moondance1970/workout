/**
 * Sample workout session data fixtures
 */

export const sampleSessions = [
  {
    date: '2024-01-15',
    exercises: [
      {
        name: 'Bench Press',
        sets: 3,
        reps: [10, 8, 6],
        weights: [100, 100, 100],
        notes: 'Good form today'
      },
      {
        name: 'Squats',
        sets: 3,
        reps: [12, 10, 8],
        weights: [80, 80, 80],
        notes: ''
      },
      {
        name: 'Pull-ups',
        sets: 3,
        reps: [8, 6, 5],
        weights: [0, 0, 0],
        notes: 'Bodyweight'
      }
    ]
  },
  {
    date: '2024-01-16',
    exercises: [
      {
        name: 'Deadlift',
        sets: 3,
        reps: [5, 5, 5],
        weights: [150, 150, 150],
        notes: 'PR!'
      },
      {
        name: 'Overhead Press',
        sets: 3,
        reps: [8, 6, 5],
        weights: [60, 60, 60],
        notes: ''
      }
    ]
  },
  {
    date: '2024-01-17',
    exercises: [
      {
        name: 'Bench Press',
        sets: 3,
        reps: [10, 9, 7],
        weights: [100, 100, 105],
        notes: 'Increased weight on last set'
      }
    ]
  }
];

export const emptySession = {
  date: new Date().toISOString().split('T')[0],
  exercises: []
};

export const singleExerciseSession = {
  date: '2024-01-18',
  exercises: [
    {
      name: 'Running',
      sets: 1,
      reps: [30],
      weights: [0],
      notes: '30 minutes'
    }
  ]
};
