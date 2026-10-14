// Set test environment before any modules load
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port; supertest binds automatically
