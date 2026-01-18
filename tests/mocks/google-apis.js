import { vi } from 'vitest';

/**
 * Comprehensive Google API mocks with realistic fixture data
 */

// Sample sheet data fixtures
export const mockSheetData = {
  sessions: [
    ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
    ['2024-01-15', 'Bench Press', '3', '10,8,6', '100,100,100', 'Good form'],
    ['2024-01-15', 'Squats', '3', '12,10,8', '80,80,80', ''],
    ['2024-01-16', 'Deadlift', '3', '5,5,5', '150,150,150', 'PR!']
  ],
  exercises: [
    ['Exercise Name', 'Timer Duration', 'YouTube Link', 'Is Aerobic'],
    ['Bench Press', '90', 'https://youtube.com/watch?v=bench', 'false'],
    ['Squats', '120', 'https://youtube.com/watch?v=squats', 'false'],
    ['Running', '0', '', 'true']
  ],
  plans: [
    ['Plan ID', 'Plan Name', 'Exercise Slots', 'Created At', 'Created By', 'Creator Sheet ID'],
    ['plan-1', 'Chest Day', '[{"slotNumber":1,"exerciseName":"Bench Press"},{"slotNumber":2,"exerciseName":"Incline Press"}]', '2024-01-01', 'user@example.com', 'sheet-123'],
    ['plan-2', 'Leg Day', '[{"slotNumber":1,"exerciseName":"Squats"},{"slotNumber":2,"exerciseName":"Leg Press"}]', '2024-01-02', 'user@example.com', 'sheet-123']
  ],
  config: [
    ['Key', 'Value'],
    ['defaultTimer', '60'],
    ['userEmail', 'user@example.com'],
    ['userName', 'Test User']
  ]
};

// Mock Google Sheets API responses
export const createMockSheetsAPI = () => {
  const sheetsData = {
    'sessions': mockSheetData.sessions,
    'exercises': mockSheetData.exercises,
    'plans': mockSheetData.plans,
    'config': mockSheetData.config
  };

  return {
    spreadsheets: {
      values: {
        get: vi.fn((params) => {
          const { spreadsheetId, range } = params;
          const sheetName = range.split('!')[0];
          const data = sheetsData[sheetName.toLowerCase()] || [];
          
          return Promise.resolve({
            result: {
              values: data,
              range: range
            }
          });
        }),
        update: vi.fn((params) => {
          const { spreadsheetId, range, values } = params;
          const sheetName = range.split('!')[0];
          if (sheetsData[sheetName.toLowerCase()]) {
            sheetsData[sheetName.toLowerCase()] = values.body.values;
          }
          return Promise.resolve({
            result: {
              updatedCells: values.body.values.flat().length,
              updatedRange: range
            }
          });
        }),
        batchGet: vi.fn((params) => {
          const { spreadsheetId, ranges } = params;
          return Promise.resolve({
            result: {
              valueRanges: ranges.map(range => {
                const sheetName = range.split('!')[0];
                const data = sheetsData[sheetName.toLowerCase()] || [];
                return {
                  range: range,
                  values: data
                };
              })
            }
          });
        }),
        batchUpdate: vi.fn((params) => {
          return Promise.resolve({
            result: {
              totalUpdatedCells: 0,
              responses: []
            }
          });
        })
      },
      get: vi.fn((params) => {
        return Promise.resolve({
          result: {
            spreadsheetId: params.spreadsheetId,
            properties: {
              title: 'Workout Tracker'
            },
            sheets: [
              {
                properties: {
                  title: 'Sheet1',
                  sheetId: 0
                }
              }
            ]
          }
        });
      }),
      create: vi.fn((params) => {
        const sheetId = `sheet-${Date.now()}`;
        return Promise.resolve({
          result: {
            spreadsheetId: sheetId,
            properties: {
              title: params.resource.properties?.title || 'Workout Tracker'
            }
          }
        });
      })
    }
  };
};

// Mock Google Drive API responses
export const createMockDriveAPI = () => {
  const files = [
    {
      id: 'sessions-sheet-123',
      name: 'Workout Tracker - Sessions',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      createdTime: '2024-01-01T00:00:00Z'
    },
    {
      id: 'static-sheet-456',
      name: 'Workout Tracker - Static',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      createdTime: '2024-01-01T00:00:00Z'
    }
  ];

  return {
    files: {
      list: vi.fn((params) => {
        const query = params.q || '';
        const filteredFiles = files.filter(file => 
          query.includes(file.name) || query === ''
        );
        
        return Promise.resolve({
          result: {
            files: filteredFiles,
            nextPageToken: null
          }
        });
      }),
      get: vi.fn((params) => {
        const file = files.find(f => f.id === params.fileId);
        return Promise.resolve({
          result: file || null
        });
      }),
      create: vi.fn((params) => {
        const newFile = {
          id: `file-${Date.now()}`,
          name: params.resource.name,
          mimeType: params.resource.mimeType || 'application/vnd.google-apps.spreadsheet',
          createdTime: new Date().toISOString()
        };
        files.push(newFile);
        return Promise.resolve({
          result: newFile
        });
      }),
      update: vi.fn((params) => {
        const fileIndex = files.findIndex(f => f.id === params.fileId);
        if (fileIndex >= 0) {
          files[fileIndex] = { ...files[fileIndex], ...params.resource };
        }
        return Promise.resolve({
          result: files[fileIndex] || null
        });
      }),
      delete: vi.fn((params) => {
        const fileIndex = files.findIndex(f => f.id === params.fileId);
        if (fileIndex >= 0) {
          files.splice(fileIndex, 1);
        }
        return Promise.resolve({});
      })
    },
    permissions: {
      create: vi.fn((params) => {
        return Promise.resolve({
          result: {
            id: `perm-${Date.now()}`,
            type: params.resource.type || 'user',
            role: params.resource.role || 'reader'
          }
        });
      })
    }
  };
};

// Mock Google Identity Services (OAuth)
export const createMockGoogleAuth = () => {
  let tokenResponse = null;
  let isSignedIn = false;

  return {
    initTokenClient: vi.fn((config) => {
      const callback = config.callback;
      return {
        requestAccessToken: vi.fn(() => {
          if (tokenResponse && tokenResponse.error) {
            // Handle error response
            if (callback) callback(tokenResponse);
          } else if (isSignedIn && tokenResponse) {
            if (callback) callback(tokenResponse);
          } else {
            // Simulate sign-in
            tokenResponse = {
              access_token: 'mock-access-token',
              expires_in: 3600,
              scope: 'https://www.googleapis.com/auth/drive.file',
              token_type: 'Bearer'
            };
            isSignedIn = true;
            if (callback) callback(tokenResponse);
          }
        })
      };
    }),
    initialize: vi.fn(),
    renderButton: vi.fn(),
    prompt: vi.fn(),
    setSignedIn: (signedIn) => {
      isSignedIn = signedIn;
    },
    setTokenResponse: (response) => {
      tokenResponse = response;
    },
    getTokenResponse: () => tokenResponse,
    isSignedIn: () => isSignedIn
  };
};

// Helper to setup all mocks
export const setupGoogleAPIMocks = () => {
  const sheetsAPI = createMockSheetsAPI();
  const driveAPI = createMockDriveAPI();
  const authAPI = createMockGoogleAuth();

  global.google = {
    accounts: {
      oauth2: {
        initTokenClient: authAPI.initTokenClient
      },
      id: {
        initialize: authAPI.initialize,
        renderButton: authAPI.renderButton,
        prompt: authAPI.prompt
      }
    },
    client: {
      init: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      sheets: sheetsAPI,
      drive: driveAPI
    }
  };

  return {
    sheets: sheetsAPI,
    drive: driveAPI,
    auth: authAPI
  };
};

// Export fixture data
export const fixtures = {
  sessions: [
    {
      date: '2024-01-15',
      exercises: [
        {
          name: 'Bench Press',
          sets: 3,
          reps: [10, 8, 6],
          weights: [100, 100, 100],
          notes: 'Good form'
        },
        {
          name: 'Squats',
          sets: 3,
          reps: [12, 10, 8],
          weights: [80, 80, 80],
          notes: ''
        }
      ]
    },
    {
      date: '2024-01-16',
      exercises: [
        {
          name: 'Deadlift',
          sets: 3,
          reps: [5, 5, 5],
          weights: [150, 150, 150],
          notes: 'PR!'
        }
      ]
    }
  ],
  exercises: [
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
      name: 'Running',
      timerDuration: 0,
      youtubeLink: '',
      isAerobic: true
    }
  ],
  plans: [
    {
      id: 'plan-1',
      name: 'Chest Day',
      exerciseSlots: [
        { slotNumber: 1, exerciseName: 'Bench Press' },
        { slotNumber: 2, exerciseName: 'Incline Press' }
      ],
      createdAt: '2024-01-01',
      createdBy: 'user@example.com',
      creatorSheetId: 'sheet-123'
    },
    {
      id: 'plan-2',
      name: 'Leg Day',
      exerciseSlots: [
        { slotNumber: 1, exerciseName: 'Squats' },
        { slotNumber: 2, exerciseName: 'Leg Press' }
      ],
      createdAt: '2024-01-02',
      createdBy: 'user@example.com',
      creatorSheetId: 'sheet-123'
    }
  ]
};
