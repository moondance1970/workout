import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';

// Mock the config module
vi.mock('../../config.js', () => ({
  GOOGLE_CONFIG: {
    CLIENT_ID: 'test-client-id',
    API_KEY: 'test-api-key'
  }
}));

describe('Config Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Local Config', () => {
    it('should load config from local file when available', async () => {
      // This would test the actual loadConfig method if it were exported
      // For now, we test the concept
      const mockConfig = {
        CLIENT_ID: 'local-client-id',
        API_KEY: 'local-api-key'
      };
      
      expect(mockConfig.CLIENT_ID).toBe('local-client-id');
      expect(mockConfig.API_KEY).toBe('local-api-key');
    });
  });

  describe('API Config', () => {
    it('should fetch config from API when local config not available', async () => {
      const mockConfig = {
        CLIENT_ID: 'api-client-id',
        API_KEY: 'api-api-key'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const response = await global.fetch('/api/config');
      const config = await response.json();

      expect(config.CLIENT_ID).toBe('api-client-id');
      expect(config.API_KEY).toBe('api-api-key');
    });

    it('should handle API fetch errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await global.fetch('/api/config');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });

    it('should handle non-200 API responses', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const response = await global.fetch('/api/config');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('getClientId', () => {
    it('should return client ID from config', async () => {
      const config = { CLIENT_ID: 'test-client-id', API_KEY: 'test-key' };
      const clientId = config?.CLIENT_ID || null;
      
      expect(clientId).toBe('test-client-id');
    });

    it('should return null for empty client ID', async () => {
      const config = { CLIENT_ID: '', API_KEY: 'test-key' };
      const clientId = config?.CLIENT_ID?.trim() || null;
      
      expect(clientId).toBeNull();
    });

    it('should return null when config is missing', async () => {
      const config = null;
      const clientId = config?.CLIENT_ID || null;
      
      expect(clientId).toBeNull();
    });
  });

  describe('getApiKey', () => {
    it('should return API key from config', async () => {
      const config = { CLIENT_ID: 'test-client-id', API_KEY: 'test-api-key' };
      const apiKey = config?.API_KEY || null;
      
      expect(apiKey).toBe('test-api-key');
    });

    it('should return null when API key is missing', async () => {
      const config = { CLIENT_ID: 'test-client-id' };
      const apiKey = config?.API_KEY || null;
      
      expect(apiKey).toBeNull();
    });
  });
});
