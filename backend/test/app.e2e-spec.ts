import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';

describe('AppController (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp('app-e2e');
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('/ (GET)', () => {
    return request(ctx.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
