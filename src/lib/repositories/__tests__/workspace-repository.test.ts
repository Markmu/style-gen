import { describe, expect, it } from 'vitest';
import { hashWorkspaceRequest } from '../workspace-repository';
describe('workspace request hash', () => {
  it('AC-09 uses canonical object keys and excludes transient token and unknown fields', () => {
    expect(hashWorkspaceRequest({ text: '原文 ', summaryToken: 'a', extra: 1, draft: { b: 2, a: 1 } }, ['text','draft','summaryToken'])).toBe(hashWorkspaceRequest({ draft: { a: 1, b: 2 }, text: '原文 ', summaryToken: 'b' }, ['draft','text','summaryToken']));
  });
  it('AC-09 retains a whitelisted authorization identity', () => {
    expect(hashWorkspaceRequest({ authorizationId: 'first' }, ['authorizationId'])).not.toBe(hashWorkspaceRequest({ authorizationId: 'second' }, ['authorizationId']));
  });
  it('AC-09 preserves exact text and array ordering', () => {
    const hash = (text: string, refs: number[]) => hashWorkspaceRequest({ text, refs }, ['text','refs']);
    expect(hash('原文 ', [1,2])).not.toBe(hash('原文', [1,2]));
    expect(hash('原文', [1,2])).not.toBe(hash('原文', [2,1]));
  });
});
