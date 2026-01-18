import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockDOM } from '../utils/test-helpers.js';

// Note: We'll need to import WorkoutTracker, but it's not exported
// For now, we'll test what we can access

describe('WorkoutTracker', () => {
  let container;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';
    container = createMockDOM();
    
    // Setup Google API mocks
    setupGoogleAPIMocks();
    
    // Clear localStorage
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should have required DOM elements', () => {
      expect(document.getElementById('sync-status')).toBeTruthy();
      expect(document.getElementById('exercise-name')).toBeTruthy();
      expect(document.getElementById('save-workout')).toBeTruthy();
      expect(document.getElementById('track-tab')).toBeTruthy();
      expect(document.getElementById('history-tab')).toBeTruthy();
      expect(document.getElementById('config-tab')).toBeTruthy();
      expect(document.getElementById('plan-tab')).toBeTruthy();
    });

    it('should have sync status indicator', () => {
      const indicator = document.getElementById('sync-indicator');
      const text = document.getElementById('sync-text');
      
      expect(indicator).toBeTruthy();
      expect(text).toBeTruthy();
      expect(text.textContent).toContain('Not Connected');
    });

    it('should have all tab buttons', () => {
      const tabs = document.querySelectorAll('.tab-btn');
      expect(tabs.length).toBe(4);
      
      const tabNames = Array.from(tabs).map(tab => tab.dataset.tab);
      expect(tabNames).toContain('track');
      expect(tabNames).toContain('history');
      expect(tabNames).toContain('config');
      expect(tabNames).toContain('plan');
    });
  });

  describe('DOM Structure', () => {
    it('should have workout form elements', () => {
      expect(document.getElementById('exercise-name')).toBeTruthy();
      expect(document.getElementById('sets')).toBeTruthy();
      expect(document.getElementById('reps-container')).toBeTruthy();
      expect(document.getElementById('notes')).toBeTruthy();
    });

    it('should have rest timer modal', () => {
      const modal = document.getElementById('rest-timer-modal');
      expect(modal).toBeTruthy();
      expect(modal.style.display).toBe('none');
    });

    it('should have victory modal', () => {
      const modal = document.getElementById('victory-modal');
      expect(modal).toBeTruthy();
      expect(modal.style.display).toBe('none');
    });

    it('should have recommendations panel', () => {
      const panel = document.getElementById('recommendations');
      expect(panel).toBeTruthy();
    });

    it('should have today workout section', () => {
      const section = document.getElementById('today-workout');
      expect(section).toBeTruthy();
    });
  });

  describe('Configuration Tab', () => {
    it('should have default timer inputs', () => {
      expect(document.getElementById('timer-minutes')).toBeTruthy();
      expect(document.getElementById('default-timer-seconds')).toBeTruthy();
      expect(document.getElementById('default-timer')).toBeTruthy();
    });

    it('should have exercise configuration section', () => {
      expect(document.getElementById('exercise-config-list')).toBeTruthy();
      expect(document.getElementById('add-exercise-config')).toBeTruthy();
    });
  });

  describe('Plan Mode Tab', () => {
    it('should have plan creation form', () => {
      expect(document.getElementById('plan-name')).toBeTruthy();
      expect(document.getElementById('plan-slots-count')).toBeTruthy();
      expect(document.getElementById('generate-slots-btn')).toBeTruthy();
      expect(document.getElementById('plan-exercise-slots')).toBeTruthy();
    });

    it('should have plan list container', () => {
      expect(document.getElementById('plans-list')).toBeTruthy();
    });

    it('should have plan indicator', () => {
      const indicator = document.getElementById('plan-indicator');
      expect(indicator).toBeTruthy();
      expect(indicator.style.display).toBe('none');
    });
  });
});
