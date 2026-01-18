import { vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() {
    return Object.keys(this._store || {}).length;
  },
  _store: {}
};

global.sessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() {
    return Object.keys(this._store || {}).length;
  },
  _store: {}
};

// Mock Chart.js
global.Chart = vi.fn().mockImplementation(() => ({
  destroy: vi.fn(),
  update: vi.fn(),
  data: { datasets: [] }
}));

// Mock clipboard API
global.navigator.clipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue('')
};

// Mock URL and URLSearchParams
global.URL = dom.window.URL;
global.URLSearchParams = dom.window.URLSearchParams;

// Mock fetch
global.fetch = vi.fn();

// Mock Google APIs (will be overridden in individual tests)
global.google = {
  accounts: {
    oauth2: {
      initTokenClient: vi.fn()
    },
    id: {
      initialize: vi.fn(),
      renderButton: vi.fn(),
      prompt: vi.fn()
    }
  },
  client: {
    init: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    sheets: {
      spreadsheets: {
        values: {
          get: vi.fn(),
          update: vi.fn(),
          batchGet: vi.fn(),
          batchUpdate: vi.fn()
        },
        get: vi.fn(),
        create: vi.fn()
      }
    },
    drive: {
      files: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      permissions: {
        create: vi.fn()
      }
    }
  }
};

// Setup localStorage mock implementation
const localStorageMock = {
  _store: {},
  getItem(key) {
    return this._store[key] || null;
  },
  setItem(key, value) {
    this._store[key] = value.toString();
  },
  removeItem(key) {
    delete this._store[key];
  },
  clear() {
    this._store = {};
  },
  get length() {
    return Object.keys(this._store).length;
  }
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Clean up after each test
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
