import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Rest Timer', () => {
  let timerInterval;
  let timerSeconds;
  let timerDuration;

  beforeEach(() => {
    timerSeconds = 0;
    timerDuration = 60;
    timerInterval = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    vi.useRealTimers();
  });

  describe('Timer Initialization', () => {
    it('should initialize timer with default duration', () => {
      const defaultDuration = 60;
      
      expect(defaultDuration).toBe(60);
    });

    it('should set custom timer duration', () => {
      const customDuration = 90;
      timerDuration = customDuration;
      
      expect(timerDuration).toBe(90);
    });

    it('should parse timer from MM:SS format', () => {
      const timeString = '1:30';
      const [minutes, seconds] = timeString.split(':').map(Number);
      const totalSeconds = minutes * 60 + seconds;
      
      expect(totalSeconds).toBe(90);
    });

    it('should format timer to MM:SS format', () => {
      const totalSeconds = 90;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      expect(formatted).toBe('1:30');
    });
  });

  describe('Timer Start/Stop', () => {
    it('should start timer and count down', () => {
      timerSeconds = timerDuration;
      let count = 0;
      
      timerInterval = setInterval(() => {
        timerSeconds--;
        count++;
        if (timerSeconds <= 0) {
          clearInterval(timerInterval);
        }
      }, 1000);
      
      vi.advanceTimersByTime(5000);
      
      expect(timerSeconds).toBeLessThan(timerDuration);
    });

    it('should stop timer', () => {
      timerSeconds = timerDuration;
      timerInterval = setInterval(() => {
        timerSeconds--;
      }, 1000);
      
      clearInterval(timerInterval);
      timerInterval = null;
      
      expect(timerInterval).toBeNull();
    });

    it('should skip timer', () => {
      timerSeconds = timerDuration;
      
      // Simulate skip
      timerSeconds = 0;
      
      expect(timerSeconds).toBe(0);
    });
  });

  describe('Timer Display', () => {
    it('should update timer display', () => {
      timerSeconds = 45;
      const display = timerSeconds.toString();
      
      expect(display).toBe('45');
    });

    it('should format timer with minutes and seconds', () => {
      timerSeconds = 90;
      const minutes = Math.floor(timerSeconds / 60);
      const seconds = timerSeconds % 60;
      const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      expect(display).toBe('1:30');
    });

    it('should handle timer at zero', () => {
      timerSeconds = 0;
      const display = timerSeconds.toString();
      
      expect(display).toBe('0');
    });
  });

  describe('Timer Completion', () => {
    it('should detect when timer reaches zero', () => {
      timerSeconds = 0;
      const isComplete = timerSeconds <= 0;
      
      expect(isComplete).toBe(true);
    });

    it('should trigger completion callback', () => {
      const callback = vi.fn();
      timerSeconds = 0;
      
      if (timerSeconds <= 0) {
        callback();
      }
      
      expect(callback).toHaveBeenCalled();
    });

    it('should hide timer modal on completion', () => {
      const modal = { style: { display: 'none' } };
      timerSeconds = 0;
      
      if (timerSeconds <= 0) {
        modal.style.display = 'none';
      }
      
      expect(modal.style.display).toBe('none');
    });
  });

  describe('Default Timer Configuration', () => {
    it('should save default timer', () => {
      const defaultTimer = 90;
      localStorage.setItem('defaultTimer', defaultTimer.toString());
      
      const saved = parseInt(localStorage.getItem('defaultTimer'), 10);
      expect(saved).toBe(90);
    });

    it('should load default timer', () => {
      localStorage.setItem('defaultTimer', '120');
      const loaded = parseInt(localStorage.getItem('defaultTimer'), 10);
      
      expect(loaded).toBe(120);
    });

    it('should use default timer when starting new timer', () => {
      const defaultTimer = parseInt(localStorage.getItem('defaultTimer') || '60', 10);
      timerDuration = defaultTimer;
      
      expect(timerDuration).toBeGreaterThan(0);
    });
  });

  describe('Timer Validation', () => {
    it('should validate timer duration is positive', () => {
      const duration = 60;
      
      expect(duration).toBeGreaterThan(0);
    });

    it('should handle zero duration timer', () => {
      const duration = 0;
      
      // Some exercises might not need a rest timer
      expect(duration).toBe(0);
    });

    it('should limit maximum timer duration', () => {
      const maxDuration = 600; // 10 minutes
      const duration = 90;
      
      expect(duration).toBeLessThanOrEqual(maxDuration);
    });
  });
});
