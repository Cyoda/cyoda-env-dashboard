import { describe, it, expect } from 'vitest';
import { validateWorkflowDoc } from '../validateWorkflowDoc';
import type { WorkflowDoc } from '../../../gateways';

const valid: WorkflowDoc = {
  version: '1.0',
  name: 'wf',
  initialState: 'draft',
  states: { draft: { transitions: [{ name: 't1', next: 'draft', manual: false }] } },
  active: true,
};

describe('validateWorkflowDoc', () => {
  it('returns [] for a valid doc', () => {
    expect(validateWorkflowDoc(valid)).toEqual([]);
  });

  it('rule 1: empty version → error at /version', () => {
    expect(validateWorkflowDoc({ ...valid, version: '' })).toContainEqual(
      expect.objectContaining({ path: '/version' }),
    );
  });

  it('rule 2: empty name → error at /name', () => {
    expect(validateWorkflowDoc({ ...valid, name: '' })).toContainEqual(
      expect.objectContaining({ path: '/name' }),
    );
  });

  it('rule 3: empty initialState → error at /initialState', () => {
    expect(validateWorkflowDoc({ ...valid, initialState: '' })).toContainEqual(
      expect.objectContaining({ path: '/initialState' }),
    );
  });

  it('rule 4: empty states object → error at /states', () => {
    expect(validateWorkflowDoc({ ...valid, states: {} })).toContainEqual(
      expect.objectContaining({ path: '/states' }),
    );
  });

  it('rule 5: initialState references non-existent state → error at /initialState', () => {
    expect(validateWorkflowDoc({ ...valid, initialState: 'nope' })).toContainEqual({
      path: '/initialState',
      message: 'Initial state "nope" does not exist.',
    });
  });

  it('rule 6: empty state name (key) → error at /states', () => {
    const bad = { ...valid, states: { '': { transitions: [] }, draft: valid.states.draft } } as any;
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states' }),
    );
  });

  it('rule 7a: transition with empty name → error at the transition path', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: { draft: { transitions: [{ name: '', next: 'draft', manual: false }] } },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/name' }),
    );
  });

  it('rule 7b: transition with empty next → error at the next path', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: { draft: { transitions: [{ name: 't', next: '', manual: false }] } },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/next' }),
    );
  });

  it('rule 7c: transition next references missing state → error at the next path', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: { draft: { transitions: [{ name: 't', next: 'nope', manual: false }] } },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual({
      path: '/states/draft/transitions/0/next',
      message: 'Target state "nope" does not exist.',
    });
  });

  it('rule 7d: transition manual is undefined → error at the manual path', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: { transitions: [{ name: 't', next: 'draft', manual: undefined as any }] },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/manual' }),
    );
  });

  it('rule 8: duplicate transition names within one state → error at second one', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [
            { name: 't', next: 'draft', manual: false },
            { name: 't', next: 'draft', manual: false },
          ],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/1/name' }),
    );
  });

  it('rule 9: processor with empty name → error at processor path', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [{
            name: 't', next: 'draft', manual: false,
            processors: [{ type: 'externalized', name: '' }],
          }],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/processors/0/name' }),
    );
  });

  it('rule 10: processor with invalid executionMode → error', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [{
            name: 't', next: 'draft', manual: false,
            processors: [{ type: 'externalized', name: 'p', executionMode: 'BAD' as any }],
          }],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/processors/0/executionMode' }),
    );
  });

  it('rule 11a: scheduled processor with delayMs <= 0 → error', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [{
            name: 't', next: 'draft', manual: false,
            processors: [{
              type: 'scheduled', name: 's',
              config: { delayMs: 0, transition: 't' },
            }],
          }],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/processors/0/config/delayMs' }),
    );
  });

  it('rule 11b: scheduled processor referencing unknown transition → error', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [{
            name: 't', next: 'draft', manual: false,
            processors: [{
              type: 'scheduled', name: 's',
              config: { delayMs: 1000, transition: 'unknown' },
            }],
          }],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual({
      path: '/states/draft/transitions/0/processors/0/config/transition',
      message: 'Scheduled transition "unknown" not found in workflow.',
    });
  });

  it('rule 12: duplicate processor names within one transition → error at second one', () => {
    const bad: WorkflowDoc = {
      ...valid,
      states: {
        draft: {
          transitions: [{
            name: 't', next: 'draft', manual: false,
            processors: [
              { type: 'externalized', name: 'p' },
              { type: 'externalized', name: 'p' },
            ],
          }],
        },
      },
    };
    expect(validateWorkflowDoc(bad)).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/processors/1/name' }),
    );
  });
});

describe('validateWorkflowDoc — cyoda-go import rules (v0.8.4)', () => {
  const goValid: WorkflowDoc = { ...valid, version: '1.4' };
  const badCriterion = { type: 'simple', jsonPath: 'amount', operation: 'EQUALS', value: '1' };

  it('returns [] for a valid doc', () => {
    expect(validateWorkflowDoc(goValid, { cyodaGo: true })).toEqual([]);
  });

  it('rejects schema version 1.0 in cyoda-go mode only', () => {
    expect(validateWorkflowDoc(valid, { cyodaGo: true })).toContainEqual(
      expect.objectContaining({ path: '/version' }),
    );
    expect(validateWorkflowDoc(valid)).toEqual([]);
  });

  it('validates the workflow criterion', () => {
    expect(validateWorkflowDoc({ ...goValid, criterion: badCriterion }, { cyodaGo: true })).toContainEqual(
      expect.objectContaining({ path: '/criterion/jsonPath' }),
    );
  });

  it('validates transition criteria', () => {
    const doc: WorkflowDoc = {
      ...goValid,
      states: { draft: { transitions: [{ name: 't1', next: 'draft', manual: false, criterion: badCriterion }] } },
    };
    expect(validateWorkflowDoc(doc, { cyodaGo: true })).toContainEqual(
      expect.objectContaining({ path: '/states/draft/transitions/0/criterion/jsonPath' }),
    );
    expect(validateWorkflowDoc(doc)).toEqual([]);
  });
});
