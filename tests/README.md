# Workout Tracker Test Suite

This directory contains a comprehensive test suite for the Workout Tracker application.

## Test Structure

```
tests/
├── setup.js              # Global test setup and mocks
├── mocks/                # Mock implementations
│   └── google-apis.js   # Google API mocks
├── fixtures/             # Test data fixtures
│   ├── sessions.js
│   ├── exercises.js
│   ├── plans.js
│   └── google-sheets.js
├── utils/                # Test utilities
│   └── test-helpers.js
├── unit/                 # Unit tests
│   ├── workout-tracker.test.js
│   ├── config.test.js
│   ├── auth.test.js
│   ├── sessions.test.js
│   ├── exercises.test.js
│   ├── plans.test.js
│   ├── recommendations.test.js
│   ├── timer.test.js
│   ├── utils.test.js
│   ├── sheets-integration.test.js
│   └── data-persistence.test.js
├── integration/          # Integration tests
│   ├── workout-tracking.test.js
│   ├── plan-mode.test.js
│   ├── plan-sharing.test.js
│   ├── exercise-config.test.js
│   └── history-viewing.test.js
└── e2e/                  # End-to-end tests
    ├── authentication.spec.js
    ├── workout-tracking.spec.js
    ├── plan-management.spec.js
    ├── ui-interactions.spec.js
    └── responsive.spec.js
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### E2E Tests Only
```bash
npm run test:e2e
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Test UI
```bash
npm run test:ui
```

## Test Coverage

The test suite covers:

- **Authentication**: Google OAuth, token management
- **Configuration**: Config loading (local and API)
- **Sessions**: Session creation, loading, deletion
- **Exercises**: Exercise CRUD operations
- **Plans**: Workout plan creation, activation, sharing
- **Recommendations**: Recommendation algorithm
- **Timer**: Rest timer functionality
- **Utils**: Utility functions (formatting, parsing)
- **Sheets Integration**: Google Sheets read/write operations
- **Data Persistence**: Data loading and saving flows
- **UI Interactions**: Tab navigation, forms, modals
- **Responsive Design**: Mobile/desktop layouts

## Mocking Strategy

All Google APIs are mocked using realistic fixtures that match actual API response structures. This ensures:
- Tests run fast without external dependencies
- Tests are reliable and deterministic
- No real API calls are made during testing

## Writing New Tests

### Unit Tests
Test individual methods and functions in isolation:
```javascript
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

### Integration Tests
Test feature workflows and component interactions:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';

describe('Feature Integration', () => {
  beforeEach(() => {
    setupGoogleAPIMocks();
  });
  
  it('should complete workflow', async () => {
    // Test complete flow
  });
});
```

### E2E Tests
Test complete user flows with browser automation:
```javascript
import { test, expect } from '@playwright/test';

test('user flow', async ({ page }) => {
  await page.goto('/');
  // Test user interactions
});
```

## Test Data

Test fixtures are located in `tests/fixtures/`:
- `sessions.js`: Sample workout sessions
- `exercises.js`: Sample exercise configurations
- `plans.js`: Sample workout plans
- `google-sheets.js`: Google Sheets API response structures

## Notes

- All tests are isolated and don't depend on external state
- Use factories for generating test data consistently
- Mock localStorage and sessionStorage appropriately
- E2E tests can optionally run against a local dev server
