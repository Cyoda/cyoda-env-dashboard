import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HelperFeatureFlags } from '@cyoda/http-api-react';
import { getDefaultRoute } from '../defaultRoute';

describe('getDefaultRoute', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prefers Trino when enabled', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(true);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(true);
    expect(getDefaultRoute()).toBe('/trino');
  });

  it('falls back to reporting when available', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(false);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(true);
    expect(getDefaultRoute()).toBe('/reporting/reports');
  });

  it('uses /workflows when neither exists (e.g. Go mode)', () => {
    vi.spyOn(HelperFeatureFlags, 'isTrinoSqlSchemaEnabled').mockReturnValue(false);
    vi.spyOn(HelperFeatureFlags, 'isReportingAvailable').mockReturnValue(false);
    expect(getDefaultRoute()).toBe('/workflows');
  });
});
