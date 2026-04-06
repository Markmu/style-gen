import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWebhookUrl } from '../webhook-utils';

describe('buildWebhookUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WEBHOOK_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prefers WEBHOOK_BASE_URL for public callback URLs', () => {
    process.env.WEBHOOK_BASE_URL = 'https://example.ngrok.app';
    process.env.VERCEL_URL = 'style-gen.vercel.app';

    expect(buildWebhookUrl('generation', 'task-1')).toBe(
      'https://example.ngrok.app/api/webhooks/replicate?taskType=generation&taskId=task-1'
    );
  });

  it('falls back to NEXT_PUBLIC_BASE_URL before NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://base.example.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    expect(buildWebhookUrl('analysis', 'task-2')).toBe(
      'https://base.example.com/api/webhooks/replicate?taskType=analysis&taskId=task-2'
    );
  });

  it('uses NEXT_PUBLIC_APP_URL when no webhook override is set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';

    expect(buildWebhookUrl('generation', 'task-3')).toBe(
      'https://app.example.com/api/webhooks/replicate?taskType=generation&taskId=task-3'
    );
  });

  it('prefixes VERCEL_URL with https', () => {
    process.env.VERCEL_URL = 'style-gen.vercel.app';

    expect(buildWebhookUrl('analysis', 'task-4')).toBe(
      'https://style-gen.vercel.app/api/webhooks/replicate?taskType=analysis&taskId=task-4'
    );
  });

  it('falls back to localhost when no env is configured', () => {
    expect(buildWebhookUrl('generation', 'task-5')).toBe(
      'http://localhost:3000/api/webhooks/replicate?taskType=generation&taskId=task-5'
    );
  });
});
