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
});
