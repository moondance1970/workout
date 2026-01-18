/**
 * Sample exercise configuration fixtures
 */

export const sampleExercises = [
  {
    name: 'Bench Press',
    timerDuration: 90,
    youtubeLink: 'https://youtube.com/watch?v=bench',
    isAerobic: false
  },
  {
    name: 'Squats',
    timerDuration: 120,
    youtubeLink: 'https://youtube.com/watch?v=squats',
    isAerobic: false
  },
  {
    name: 'Deadlift',
    timerDuration: 180,
    youtubeLink: 'https://youtube.com/watch?v=deadlift',
    isAerobic: false
  },
  {
    name: 'Running',
    timerDuration: 0,
    youtubeLink: '',
    isAerobic: true
  },
  {
    name: 'Pull-ups',
    timerDuration: 60,
    youtubeLink: '',
    isAerobic: false
  }
];

export const exerciseWithNoTimer = {
  name: 'Stretching',
  timerDuration: 0,
  youtubeLink: '',
  isAerobic: false
};

export const exerciseWithYouTube = {
  name: 'Bench Press',
  timerDuration: 90,
  youtubeLink: 'https://youtube.com/watch?v=example',
  isAerobic: false
};
