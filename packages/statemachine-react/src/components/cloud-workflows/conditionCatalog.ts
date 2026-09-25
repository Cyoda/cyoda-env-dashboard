/**
 * Condition DSL catalog shared by the cloud workflow editor and its validator.
 *
 * Operator names follow the cloud `OperatorType` enum
 * (docs/cyoda-cloud/api/openapi-common.yml), which cyoda-go implements minus
 * the change-generation operators IS_CHANGED / IS_UNCHANGED. Since cyoda-go
 * v0.8.4, an unknown operator, a malformed `jsonPath` or a `NOT` group without
 * exactly one child fails workflow import with `400 VALIDATION_FAILED`, so the
 * editor checks the same rules client-side in cyoda-go mode.
 */

export const COMPARISON_OPS = [
  'EQUALS', 'NOT_EQUAL', 'GREATER_THAN', 'GREATER_OR_EQUAL', 'LESS_THAN', 'LESS_OR_EQUAL',
];
export const STRING_OPS = [
  'CONTAINS', 'NOT_CONTAINS', 'STARTS_WITH', 'NOT_STARTS_WITH', 'ENDS_WITH', 'NOT_ENDS_WITH',
];
export const CASE_INSENSITIVE_OPS = [
  'IEQUALS', 'INOT_EQUAL', 'ICONTAINS', 'INOT_CONTAINS',
  'ISTARTS_WITH', 'INOT_STARTS_WITH', 'IENDS_WITH', 'INOT_ENDS_WITH',
];
export const PATTERN_OPS = ['LIKE', 'MATCHES_PATTERN'];
export const PRESENCE_OPS = ['IS_NULL', 'NOT_NULL'];
/** Range operators take a two-element `[low, high]` array operand. */
export const RANGE_OPS = ['BETWEEN', 'BETWEEN_INCLUSIVE'];

/** Every operator cyoda-go accepts (`cyoda help search`, exhaustive list). */
export const CYODA_GO_OPERATORS: ReadonlySet<string> = new Set([
  ...COMPARISON_OPS, ...STRING_OPS, ...CASE_INSENSITIVE_OPS,
  ...PATTERN_OPS, ...PRESENCE_OPS, ...RANGE_OPS,
]);

export const GROUP_OPERATORS = ['AND', 'OR', 'NOT'];

/**
 * Workflow-import schema version stamped on new workflows in cyoda-go mode.
 * cyoda-go v0.8.4 accepts 1.1–1.4 (`GET /help/workflows/schema-version/versions`);
 * 1.4 is the first version carrying the `NOT` group operator.
 */
export const CYODA_GO_WORKFLOW_SCHEMA_VERSION = '1.4';
const CYODA_GO_SCHEMA_MAJOR = 1;
const CYODA_GO_SCHEMA_MIN_MINOR = 1;
const CYODA_GO_SCHEMA_MAX_MINOR = 4;

/** Returns an error message, or null when `version` is accepted by cyoda-go. */
export function checkCyodaGoSchemaVersion(version: string): string | null {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!m) return `Version "${version}" must be MAJOR.MINOR, e.g. "${CYODA_GO_WORKFLOW_SCHEMA_VERSION}".`;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major !== CYODA_GO_SCHEMA_MAJOR || minor < CYODA_GO_SCHEMA_MIN_MINOR || minor > CYODA_GO_SCHEMA_MAX_MINOR) {
    return `Version "${version}" is not supported by cyoda-go (supported: `
      + `${CYODA_GO_SCHEMA_MAJOR}.${CYODA_GO_SCHEMA_MIN_MINOR}–${CYODA_GO_SCHEMA_MAJOR}.${CYODA_GO_SCHEMA_MAX_MINOR}).`;
  }
  return null;
}

// jsonPath  = "$." segment ( "." segment )*
// segment   = name subscript*
// name      = 1*( ALPHA / DIGIT / "_" / "-" )
// subscript = "[" ( "*" / 1*DIGIT ) "]"     ; index must fit a signed 32-bit int
const SEGMENT = String.raw`[A-Za-z0-9_-]+(?:\[(?:\*|\d+)\])*`;
const JSON_PATH_RE = new RegExp(String.raw`^\$\.${SEGMENT}(?:\.${SEGMENT})*$`);
const INT32_MAX = 2147483647;

export function isValidJsonPath(path: string): boolean {
  if (!JSON_PATH_RE.test(path)) return false;
  for (const m of path.matchAll(/\[(\d+)\]/g)) {
    if (Number(m[1]) > INT32_MAX) return false;
  }
  return true;
}

export interface ConditionIssue {
  path: string;
  message: string;
}

/**
 * Validates a criterion tree against the cyoda-go condition grammar. Function
 * conditions are opaque (dispatched to a compute node) except for their
 * optional nested `criterion`, which is validated like any other.
 */
export function validateCyodaGoCondition(cond: unknown, path: string): ConditionIssue[] {
  const issues: ConditionIssue[] = [];
  const walk = (c: any, p: string) => {
    if (!c || typeof c !== 'object') return;
    switch (c.type) {
      case 'simple': {
        if (typeof c.jsonPath !== 'string' || !isValidJsonPath(c.jsonPath)) {
          issues.push({
            path: `${p}/jsonPath`,
            message: `JSONPath "${c.jsonPath ?? ''}" is invalid — use "$." segments, e.g. $.amount or $.tags[*].`,
          });
        }
        checkOperator(c, p);
        break;
      }
      case 'lifecycle':
        checkOperator(c, p);
        break;
      case 'array':
        if (typeof c.jsonPath !== 'string' || !isValidJsonPath(c.jsonPath) || !c.jsonPath.endsWith('[*]')) {
          issues.push({ path: `${p}/jsonPath`, message: 'Array condition JSONPath must end with [*], e.g. $.tags[*].' });
        }
        break;
      case 'group': {
        const children: unknown[] = Array.isArray(c.conditions) ? c.conditions : [];
        if (!GROUP_OPERATORS.includes(c.operator)) {
          issues.push({ path: `${p}/operator`, message: `Group operator must be AND, OR or NOT (got "${c.operator ?? ''}").` });
        } else if (c.operator === 'NOT' && children.length !== 1) {
          issues.push({ path: `${p}/conditions`, message: `NOT takes exactly one condition (has ${children.length}). Nest an AND/OR group to negate several.` });
        }
        children.forEach((child, i) => walk(child, `${p}/conditions/${i}`));
        break;
      }
      case 'function':
        walk(c.function?.criterion, `${p}/function/criterion`);
        break;
      default:
        break;
    }
  };
  const checkOperator = (c: any, p: string) => {
    const op = c.operatorType ?? c.operator ?? c.operation;
    if (typeof op !== 'string' || !CYODA_GO_OPERATORS.has(op)) {
      issues.push({ path: `${p}/operation`, message: `Unknown operator "${op ?? ''}".` });
    }
  };
  walk(cond, path);
  return issues;
}
