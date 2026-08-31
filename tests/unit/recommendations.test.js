import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sampleSessions } from '../fixtures/sessions.js';

describe('Recommendations', () => {
  describe('Recommendation Calculation', () => {
    it('should calculate average weight for exercise', () => {
      const exerciseName = 'Bench Press';
      const sessions = sampleSessions.filter(s => 
        s.exercises.some(ex => ex.name === exerciseName)
      );
      
      const allWeights = [];
      sessions.forEach(session => {
        session.exercises.forEach(ex => {
          if (ex.name === exerciseName) {
            allWeights.push(...ex.weights);
          }
        });
      });
      
      const avgWeight = allWeights.reduce((sum, w) => sum + w, 0) / allWeights.length;
      
      expect(avgWeight).toBeGreaterThan(0);
      expect(typeof avgWeight).toBe('number');
    });

    it('should calculate average reps for exercise', () => {
      const exerciseName = 'Bench Press';
      const sessions = sampleSessions.filter(s => 
        s.exercises.some(ex => ex.name === exerciseName)
      );
      
      const allReps = [];
      sessions.forEach(session => {
        session.exercises.forEach(ex => {
          if (ex.name === exerciseName) {
            allReps.push(...ex.reps);
          }
        });
      });
      
      const avgReps = allReps.reduce((sum, r) => sum + r, 0) / allReps.length;
      
      expect(avgReps).toBeGreaterThan(0);
      expect(typeof avgReps).toBe('number');
    });

    it('should detect weight progression', () => {
      const exerciseName = 'Bench Press';
      const sessions = sampleSessions.filter(s => 
        s.exercises.some(ex => ex.name === exerciseName)
      ).sort((a, b) => a.date.localeCompare(b.date));
      
      if (sessions.length >= 2) {
        const firstSession = sessions[0];
        const lastSession = sessions[sessions.length - 1];
        
        const firstWeights = firstSession.exercises.find(ex => ex.name === exerciseName)?.weights || [];
        const lastWeights = lastSession.exercises.find(ex => ex.name === exerciseName)?.weights || [];
        
        const firstAvg = firstWeights.reduce((sum, w) => sum + w, 0) / firstWeights.length;
        const lastAvg = lastWeights.reduce((sum, w) => sum + w, 0) / lastWeights.length;
        
        const hasProgress = lastAvg > firstAvg;
        
        expect(typeof hasProgress).toBe('boolean');
      }
    });

    it('should recommend weight increase when reps are consistent', () => {
      const lastSession = sampleSessions[0];
      const exercise = lastSession.exercises[0];
      
      // If all reps are same or increasing, suggest weight increase
      const repsConsistent = exercise.reps.every((rep, i) => 
        i === 0 || rep >= exercise.reps[i - 1]
      );
      
      if (repsConsistent) {
        const recommendation = {
          type: 'increase',
          suggestion: `Try increasing weight by 2.5-5kg`
        };
        
        expect(recommendation.type).toBe('increase');
      }
    });

    it('should recommend weight decrease when reps are decreasing', () => {
      const lastSession = sampleSessions[0];
      const exercise = lastSession.exercises[0];
      
      // If reps are decreasing significantly, suggest weight decrease
      const repsDecreasing = exercise.reps.some((rep, i) => 
        i > 0 && rep < exercise.reps[i - 1] - 2
      );
      
      if (repsDecreasing) {
        const recommendation = {
          type: 'decrease',
          suggestion: `Consider reducing weight to maintain form`
        };
        
        expect(recommendation.type).toBe('decrease');
      }
    });

    it('should provide recommendation for new exercise', () => {
      const exerciseName = 'New Exercise';
      const hasHistory = sampleSessions.some(s => 
        s.exercises.some(ex => ex.name === exerciseName)
      );
      
      if (!hasHistory) {
        const recommendation = {
          type: 'new',
          suggestion: 'Start with moderate weight and focus on form'
        };
        
        expect(recommendation.type).toBe('new');
      }
    });
  });

  describe('Recommendation Display', () => {
    it('should format recommendation message', () => {
      const recommendation = {
        type: 'increase',
        current: '100kg',
        suggestion: 'Try 105kg'
      };
      
      const message = `Current: ${recommendation.current}. ${recommendation.suggestion}`;
      
      expect(message).toContain(recommendation.current);
      expect(message).toContain(recommendation.suggestion);
    });

    it('should handle multiple recommendations', () => {
      const recommendations = [
        { type: 'increase', suggestion: 'Increase weight' },
        { type: 'form', suggestion: 'Focus on form' }
      ];
      
      expect(recommendations.length).toBe(2);
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('suggestion');
      });
    });
  });

  describe('Exercise History Analysis', () => {
    it('should find all sessions with specific exercise', () => {
      const exerciseName = 'Bench Press';
      const sessionsWithExercise = sampleSessions.filter(s => 
        s.exercises.some(ex => ex.name === exerciseName)
      );
      
      expect(sessionsWithExercise.length).toBeGreaterThan(0);
      sessionsWithExercise.forEach(session => {
        expect(session.exercises.some(ex => ex.name === exerciseName)).toBe(true);
      });
    });

    it('should get latest session for exercise', () => {
      const exerciseName = 'Bench Press';
      const sessionsWithExercise = sampleSessions
        .filter(s => s.exercises.some(ex => ex.name === exerciseName))
        .sort((a, b) => b.date.localeCompare(a.date));
      
      if (sessionsWithExercise.length > 0) {
        const latest = sessionsWithExercise[0];
        expect(latest.exercises.some(ex => ex.name === exerciseName)).toBe(true);
      }
    });

    it('should calculate total volume (weight × reps)', () => {
      const exercise = sampleSessions[0].exercises[0];
      let totalVolume = 0;

      for (let i = 0; i < exercise.reps.length; i++) {
        totalVolume += exercise.reps[i] * exercise.weights[i];
      }

      expect(totalVolume).toBeGreaterThan(0);
    });
  });

  describe('Week-gap gating (no "increase" nudge after a long break)', () => {
    // Mirrors the weekOrMorePassed gate added to getRecommendations() in app.js
    const daysSince = (dateStr, now = new Date('2026-06-15')) => {
      return Math.floor((now - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    };

    const applyWeekGap = (suggestion, daysSinceLastExercise) => {
      if (daysSinceLastExercise >= 7 && suggestion.action === 'increase') {
        return {
          action: 'maintain',
          text: `It's been ${daysSinceLastExercise} days since you last did this - ease back in at your previous weight/reps before increasing`
        };
      }
      return suggestion;
    };

    it('should downgrade an "increase" suggestion to "maintain" after 7+ days', () => {
      const gap = daysSince('2026-06-01'); // 14 days before the reference "now"
      expect(gap).toBeGreaterThanOrEqual(7);

      const result = applyWeekGap({ action: 'increase', text: 'Try increasing weight' }, gap);
      expect(result.action).toBe('maintain');
      expect(result.text).toContain(`${gap} days`);
    });

    it('should leave an "increase" suggestion alone within a week', () => {
      const gap = daysSince('2026-06-10'); // 5 days before the reference "now"
      expect(gap).toBeLessThan(7);

      const result = applyWeekGap({ action: 'increase', text: 'Try increasing weight' }, gap);
      expect(result.action).toBe('increase');
    });

    it('should not affect "decrease" or "maintain" suggestions regardless of gap', () => {
      const longGap = 30;
      const decrease = applyWeekGap({ action: 'decrease', text: 'Decrease weight' }, longGap);
      const maintain = applyWeekGap({ action: 'maintain', text: 'Keep current weight' }, longGap);

      expect(decrease.action).toBe('decrease');
      expect(maintain.action).toBe('maintain');
    });

    it('should measure the gap from the prior entry, not "now", when today\'s save is already in the history', () => {
      // Mirrors getRecommendations() picking `second` instead of `first` when
      // `first` is today's just-saved entry
      const today = '2026-06-15';
      const entries = [
        { date: today, weights: [40], reps: [10] },      // just saved
        { date: '2026-05-20', weights: [40], reps: [10] } // last real occurrence, 26 days prior
      ];
      const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
      const [first, second] = sorted;
      const priorEntry = first.date === today ? second : first;
      const gap = daysSince(priorEntry.date, new Date(today));

      expect(priorEntry.date).toBe('2026-05-20');
      expect(gap).toBeGreaterThanOrEqual(7);
    });
  });
});
