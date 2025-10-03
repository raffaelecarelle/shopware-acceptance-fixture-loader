// Jest setup file for global test configuration
import * as fs from 'fs';
import * as path from 'path';

// Mock console methods for cleaner test output
global.console = {
  ...console
  // Uncomment the line below to suppress console.log during tests
  // log: jest.fn(),
};

// Setup test fixtures directory
export const TEST_FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Ensure test fixtures directory exists
beforeAll(() => {
  if (!fs.existsSync(TEST_FIXTURES_DIR)) {
    fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
  }
});

// Clean up after all tests
afterAll(() => {
  // Cleanup any temporary test files if needed
});