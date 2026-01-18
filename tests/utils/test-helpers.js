/**
 * Test utility functions and helpers
 */

/**
 * Create a mock DOM structure matching the app's HTML
 */
export function createMockDOM() {
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <header>
      <h1>💪 Workout Tracker</h1>
      <div class="sync-status" id="sync-status">
        <span id="sync-indicator">⚪</span>
        <span id="sync-text">Not Connected</span>
      </div>
      <div id="session-btn-container">
        <button id="session-btn" style="display: none;">New Session</button>
        <div id="google-signin-button-header"></div>
      </div>
      <div class="nav-tabs">
        <button class="tab-btn active" data-tab="track">Track Workout</button>
        <button class="tab-btn" data-tab="history">History & Graphs</button>
        <button class="tab-btn" data-tab="config">Configuration</button>
        <button class="tab-btn" data-tab="plan">Plan Mode</button>
      </div>
    </header>
    
    <div id="track-tab" class="tab-content active">
      <div id="welcome-message" style="display: none;">
        <p id="welcome-text"></p>
      </div>
      <div id="plan-mode-indicator" style="display: none;">
        <p><strong>Plan Mode Active:</strong> <span id="active-plan-name"></span></p>
      </div>
      <div class="session-controls">
        <button id="start-session-btn" style="display: none;">Start Session</button>
        <button id="save-workout" style="display: none;">Save Exercise</button>
        <select id="select-plan-dropdown" style="display: none;">
          <option value="">Select Plan...</option>
        </select>
      </div>
      <div class="workout-form">
        <div class="form-group">
          <label for="exercise-name">Exercise Name</label>
          <div class="exercise-name-container">
            <select id="exercise-name" class="exercise-select">
              <option value="">Select or type to add new...</option>
            </select>
            <input type="text" id="exercise-name-new" class="exercise-input-new" placeholder="New exercise name..." style="display: none;">
            <button type="button" id="add-exercise-btn" class="btn-secondary exercise-add-btn">+ Add</button>
          </div>
        </div>
        <div class="form-group">
          <label for="sets">Sets</label>
          <input type="number" id="sets" placeholder="3" min="1" max="10" value="3">
        </div>
        <div class="form-group">
          <label>Reps and Weight for Each Set</label>
          <div id="reps-container"></div>
        </div>
        <div class="form-group">
          <label for="notes">Notes</label>
          <textarea id="notes" placeholder="Any additional notes..." rows="2"></textarea>
        </div>
      </div>
      <div id="rest-timer-modal" class="rest-timer-modal" style="display: none;">
        <div class="rest-timer-backdrop"></div>
        <div class="rest-timer-content">
          <h3>⏱️ Rest Timer</h3>
          <div class="timer-display">
            <div class="timer-circle">
              <span id="timer-seconds">60</span>
              <span class="timer-label">seconds</span>
            </div>
          </div>
          <button id="skip-timer-btn" class="btn-secondary">Skip Rest</button>
        </div>
      </div>
      <div id="recommendations" class="recommendations-panel">
        <h3>📊 Recommendations</h3>
        <div id="recommendations-content">
          <p class="no-data">Complete an exercise to see recommendations</p>
        </div>
      </div>
      <div id="today-workout" class="today-workout">
        <h3>Today's Workout</h3>
        <div id="today-exercises"></div>
      </div>
    </div>
    
    <div id="history-tab" class="tab-content">
      <div class="history-controls">
        <select id="exercise-filter">
          <option value="all">All Exercises</option>
        </select>
        <select id="time-filter">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div class="chart-container">
        <canvas id="progress-chart"></canvas>
      </div>
      <div id="history-list" class="history-list">
        <h3>Recent Sessions</h3>
        <div id="history-content"></div>
      </div>
    </div>
    
    <div id="config-tab" class="tab-content">
      <div class="config-section">
        <h3>Default Rest Timer</h3>
        <div class="form-group">
          <label for="default-timer">Rest Timer Duration</label>
          <input type="number" id="timer-minutes" min="0" max="59" value="1">
          <input type="number" id="default-timer-seconds" min="0" max="59" value="0">
          <input type="hidden" id="default-timer" value="1:00">
        </div>
        <button id="save-default-timer" class="btn-primary">Save Default Timer</button>
      </div>
      <div class="config-section">
        <h3>Exercise Configuration</h3>
        <div id="exercise-config-list"></div>
        <button id="add-exercise-config" class="btn-primary">+ Add New Exercise</button>
      </div>
    </div>
    
    <div id="plan-tab" class="tab-content">
      <div id="plan-indicator" class="plan-indicator" style="display: none;">
        <div class="plan-indicator-content">
          <span id="current-plan-name"></span>
          <button id="clear-plan-btn" class="btn-secondary">Clear Plan</button>
        </div>
      </div>
      <div class="config-section">
        <h3>Workout Plans</h3>
        <div id="plans-list"></div>
        <h4 id="plan-form-title">Create New Plan</h4>
        <div class="form-group">
          <label for="plan-name">Plan Name</label>
          <input type="text" id="plan-name" placeholder="e.g., Leg Day, Chest Day">
        </div>
        <div class="form-group">
          <label for="plan-slots-count">Number of Exercise Slots</label>
          <input type="number" id="plan-slots-count" min="1" max="20" value="5" placeholder="5">
        </div>
        <div class="form-group">
          <button id="generate-slots-btn" class="btn-secondary">Generate Exercise Slots</button>
        </div>
        <div id="plan-exercise-slots"></div>
        <div class="form-group">
          <button id="save-plan-btn" class="btn-primary" style="display: none;">Save Plan</button>
          <button id="cancel-plan-btn" class="btn-secondary" style="display: none;">Cancel</button>
        </div>
      </div>
    </div>
    
    <div id="victory-modal" class="victory-modal" style="display: none;">
      <div class="victory-backdrop"></div>
      <div class="victory-content">
        <div class="victory-icon">🏆</div>
        <h2 class="victory-title">Plan Complete!</h2>
        <p class="victory-message" id="victory-plan-name"></p>
        <p class="victory-subtitle">You've completed all exercises in your workout plan!</p>
        <button id="victory-close-btn" class="btn-primary victory-button">Awesome!</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  return container;
}

/**
 * Wait for async operations to complete
 */
export function waitFor(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock workout session
 */
export function createMockSession(date, exercises = []) {
  return {
    date,
    exercises
  };
}

/**
 * Create a mock exercise
 */
export function createMockExercise(name, sets = 3, reps = [10, 8, 6], weights = [100, 100, 100], notes = '') {
  return {
    name,
    sets,
    reps: Array.isArray(reps) ? reps : Array(sets).fill(reps),
    weights: Array.isArray(weights) ? weights : Array(sets).fill(weights),
    notes
  };
}

/**
 * Create a mock workout plan
 */
export function createMockPlan(id, name, exerciseSlots = [], createdAt = new Date().toISOString().split('T')[0]) {
  return {
    id,
    name,
    exerciseSlots,
    createdAt,
    createdBy: 'user@example.com',
    creatorSheetId: 'sheet-123'
  };
}

/**
 * Create a mock exercise configuration
 */
export function createMockExerciseConfig(name, timerDuration = 60, youtubeLink = '', isAerobic = false) {
  return {
    name,
    timerDuration,
    youtubeLink,
    isAerobic
  };
}

/**
 * Simulate user interaction
 */
export function simulateClick(element) {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  element.dispatchEvent(event);
}

/**
 * Simulate input change
 */
export function simulateInput(element, value) {
  element.value = value;
  const event = new Event('input', { bubbles: true });
  element.dispatchEvent(event);
  const changeEvent = new Event('change', { bubbles: true });
  element.dispatchEvent(changeEvent);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Mock localStorage with actual storage
 */
export function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(key => delete store[key]); },
    get length() { return Object.keys(store).length; }
  };
}
