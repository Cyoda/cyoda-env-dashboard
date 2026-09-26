import { HelperFeatureFlags } from '@cyoda/http-api-react';

/** Landing route after login; only returns routes that are registered in this mode. */
export function getDefaultRoute(): string {
  if (HelperFeatureFlags.isTrinoSqlSchemaEnabled()) {
    return '/trino';
  }
  if (HelperFeatureFlags.isReportingAvailable()) {
    return '/reporting/reports';
  }
  return '/workflows';
}
