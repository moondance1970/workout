/**
 * Google Sheets API response structure fixtures
 */

export const sheetsResponseStructure = {
  get: {
    values: [
      ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
      ['2024-01-15', 'Bench Press', '3', '10,8,6', '100,100,100', 'Good form']
    ],
    range: 'Sheet1!A1:F2'
  },
  batchGet: {
    valueRanges: [
      {
        range: 'Sheet1!A1:F10',
        values: [
          ['Date', 'Exercise', 'Sets', 'Reps', 'Weights', 'Notes'],
          ['2024-01-15', 'Bench Press', '3', '10,8,6', '100,100,100', 'Good form']
        ]
      }
    ]
  },
  update: {
    updatedCells: 6,
    updatedRange: 'Sheet1!A1:F1'
  },
  create: {
    spreadsheetId: 'new-sheet-id-123',
    properties: {
      title: 'Workout Tracker'
    }
  }
};

export const driveResponseStructure = {
  list: {
    files: [
      {
        id: 'file-123',
        name: 'Workout Tracker - Sessions',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        createdTime: '2024-01-01T00:00:00Z'
      }
    ],
    nextPageToken: null
  },
  get: {
    id: 'file-123',
    name: 'Workout Tracker - Sessions',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    createdTime: '2024-01-01T00:00:00Z'
  },
  create: {
    id: 'new-file-456',
    name: 'New Workout Tracker',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    createdTime: new Date().toISOString()
  }
};
