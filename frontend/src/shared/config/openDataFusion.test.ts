import { describe, expect, it } from 'vitest';
import { getOpenDataFusionUrl } from './openDataFusion';

describe('getOpenDataFusionUrl', () => {
  it('returns null when the feature flag is absent', () => {
    expect(getOpenDataFusionUrl(undefined)).toBeNull();
  });

  it('returns a normalized absolute HTTP URL', () => {
    expect(getOpenDataFusionUrl('http://localhost:58088')).toBe('http://localhost:58088/');
  });

  it('rejects a non-HTTP URL', () => {
    expect(getOpenDataFusionUrl('javascript:alert(1)')).toBeNull();
  });
});
