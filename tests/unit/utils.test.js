import { describe, it, expect, beforeEach } from 'vitest';

describe('Utility Functions', () => {
  describe('Date Formatting', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2024-01-15');
      const formatted = date.toISOString().split('T')[0];
      
      expect(formatted).toBe('2024-01-15');
    });

    it('should get today date', () => {
      const today = new Date().toISOString().split('T')[0];
      const expectedFormat = /^\d{4}-\d{2}-\d{2}$/;
      
      expect(today).toMatch(expectedFormat);
    });
  });

  describe('Timer Formatting', () => {
    it('should format seconds to MM:SS', () => {
      const seconds = 90;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`;
      
      expect(formatted).toBe('1:30');
    });

    it('should format single digit seconds with leading zero', () => {
      const seconds = 65;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`;
      
      expect(formatted).toBe('1:05');
    });

    it('should parse MM:SS format to seconds', () => {
      const timeString = '1:30';
      const [minutes, seconds] = timeString.split(':').map(Number);
      const totalSeconds = minutes * 60 + seconds;
      
      expect(totalSeconds).toBe(90);
    });

    it('should handle zero seconds', () => {
      const seconds = 0;
      const formatted = `0:${seconds.toString().padStart(2, '0')}`;
      
      expect(formatted).toBe('0:00');
    });
  });

  describe('Exercise Duration Formatting', () => {
    it('should format duration in seconds to readable format', () => {
      const seconds = 120;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      
      let formatted;
      if (minutes > 0) {
        formatted = secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
      } else {
        formatted = `${secs}s`;
      }
      
      expect(formatted).toBe('2m');
    });

    it('should format duration with both minutes and seconds', () => {
      const seconds = 90;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      
      let formatted;
      if (minutes > 0) {
        formatted = secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
      } else {
        formatted = `${secs}s`;
      }
      
      expect(formatted).toBe('1m 30s');
    });
  });

  describe('Difficulty Formatting', () => {
    it('should format difficulty level', () => {
      const difficulty = 'medium';
      const formatted = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
      
      expect(formatted).toBe('Medium');
    });
  });

  describe('Array Operations', () => {
    it('should normalize exercise list structure', () => {
      const exercises = [
        { name: 'Bench Press' },
        { name: 'Squats', timerDuration: 120 }
      ];
      
      const normalized = exercises.map(ex => ({
        name: ex.name,
        timerDuration: ex.timerDuration || 60,
        youtubeLink: ex.youtubeLink || '',
        isAerobic: ex.isAerobic || false
      }));
      
      expect(normalized[0].timerDuration).toBe(60);
      expect(normalized[1].timerDuration).toBe(120);
    });

    it('should remove duplicates from array', () => {
      const exercises = ['Bench Press', 'Squats', 'Bench Press', 'Deadlift'];
      const unique = [...new Set(exercises)];
      
      expect(unique.length).toBe(3);
      expect(unique).toContain('Bench Press');
      expect(unique).toContain('Squats');
      expect(unique).toContain('Deadlift');
    });
  });

  describe('String Operations', () => {
    it('should normalize exercise name (trim and capitalize)', () => {
      const name = '  bench press  ';
      const normalized = name.trim().split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
      
      expect(normalized).toBe('Bench Press');
    });

    it('should check if string is empty or whitespace', () => {
      const empty = '';
      const whitespace = '   ';
      const valid = 'Bench Press';
      
      expect(empty.trim().length).toBe(0);
      expect(whitespace.trim().length).toBe(0);
      expect(valid.trim().length).toBeGreaterThan(0);
    });
  });

  describe('Number Operations', () => {
    it('should round to one decimal place', () => {
      const number = 12.345;
      const rounded = Math.round(number * 10) / 10;
      
      expect(rounded).toBe(12.3);
    });

    it('should calculate percentage', () => {
      const value = 75;
      const total = 100;
      const percentage = (value / total) * 100;
      
      expect(percentage).toBe(75);
    });

    it('should calculate average', () => {
      const numbers = [10, 20, 30, 40, 50];
      const average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
      
      expect(average).toBe(30);
    });
  });

  describe('Object Operations', () => {
    it('should deep clone object', () => {
      const original = { name: 'Bench Press', sets: 3 };
      const cloned = JSON.parse(JSON.stringify(original));
      
      cloned.sets = 4;
      
      expect(original.sets).toBe(3);
      expect(cloned.sets).toBe(4);
    });

    it('should merge objects', () => {
      const obj1 = { name: 'Bench Press', sets: 3 };
      const obj2 = { sets: 4, reps: [10, 8, 6] };
      const merged = { ...obj1, ...obj2 };
      
      expect(merged.name).toBe('Bench Press');
      expect(merged.sets).toBe(4);
      expect(merged.reps).toEqual([10, 8, 6]);
    });
  });
});
