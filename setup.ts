import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Increase timeout for integration tests
jest.setTimeout(30000);
