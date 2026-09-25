/**
 * Pure validator for cloud workflow documents. Rules are spelled out in
 * docs/superpowers/specs/2026-04-17-cloud-workflow-editor-design.md §3.4.
 */
import type { WorkflowDoc, ProcessorExecutionMode } from '../../gateways';
import {
  checkCyodaGoSchemaVersion,
  validateCyodaGoCondition,
} from '../../components/cloud-workflows/conditionCatalog';

export interface ValidationIssue {
  path: string;
  message: string;
}

const VALID_EXECUTION_MODES: ProcessorExecutionMode[] = ['SYNC', 'ASYNC_SAME_TX', 'ASYNC_NEW_TX'];

export interface ValidateWorkflowDocOptions {
  /**
   * Apply the rules cyoda-go enforces at workflow import (schema version range,
   * criterion JSONPath grammar, operator catalog, single-child NOT).
   */
  cyodaGo?: boolean;
}

export function validateWorkflowDoc(doc: WorkflowDoc, opts: ValidateWorkflowDocOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!doc.version) issues.push({ path: '/version', message: 'Version is required.' });
  else if (opts.cyodaGo) {
    const versionError = checkCyodaGoSchemaVersion(doc.version);
    if (versionError) issues.push({ path: '/version', message: versionError });
  }
  if (opts.cyodaGo) issues.push(...validateCyodaGoCondition(doc.criterion, '/criterion'));
  if (!doc.name) issues.push({ path: '/name', message: 'Name is required.' });
  if (!doc.initialState) issues.push({ path: '/initialState', message: 'Initial state is required.' });

  const stateNames = Object.keys(doc.states ?? {});
  if (stateNames.length === 0) {
    issues.push({ path: '/states', message: 'At least one state is required.' });
  }
  if (stateNames.some((n) => n === '')) {
    issues.push({ path: '/states', message: 'State names cannot be empty.' });
  }
  if (doc.initialState && !(doc.initialState in (doc.states ?? {}))) {
    issues.push({
      path: '/initialState',
      message: `Initial state "${doc.initialState}" does not exist.`,
    });
  }

  // Pre-compute the set of all transition names across the doc — needed for
  // scheduled-processor cross-references (rule 11b).
  const allTransitionNames = new Set<string>();
  for (const state of Object.values(doc.states ?? {})) {
    for (const t of state.transitions ?? []) {
      if (t.name) allTransitionNames.add(t.name);
    }
  }

  for (const [stateName, state] of Object.entries(doc.states ?? {})) {
    const transitions = state.transitions ?? [];
    const seenTransitionNames = new Set<string>();
    transitions.forEach((t, i) => {
      const tPath = `/states/${stateName}/transitions/${i}`;
      if (!t.name) issues.push({ path: `${tPath}/name`, message: 'Transition name is required.' });
      if (!t.next) issues.push({ path: `${tPath}/next`, message: 'Transition target (next) is required.' });
      if (t.next && !(t.next in (doc.states ?? {}))) {
        issues.push({ path: `${tPath}/next`, message: `Target state "${t.next}" does not exist.` });
      }
      if (opts.cyodaGo) issues.push(...validateCyodaGoCondition(t.criterion, `${tPath}/criterion`));
      if (typeof t.manual !== 'boolean') {
        issues.push({ path: `${tPath}/manual`, message: 'Transition "manual" must be boolean.' });
      }
      if (t.name) {
        if (seenTransitionNames.has(t.name)) {
          issues.push({ path: `${tPath}/name`, message: `Duplicate transition name "${t.name}".` });
        }
        seenTransitionNames.add(t.name);
      }

      const seenProcNames = new Set<string>();
      (t.processors ?? []).forEach((p, pi) => {
        const pPath = `${tPath}/processors/${pi}`;
        if (!p.name) issues.push({ path: `${pPath}/name`, message: 'Processor name is required.' });
        if (p.executionMode && !VALID_EXECUTION_MODES.includes(p.executionMode)) {
          issues.push({ path: `${pPath}/executionMode`, message: `Invalid executionMode "${p.executionMode}".` });
        }
        if (p.type === 'scheduled') {
          const cfg = (p.config ?? {}) as { delayMs?: number; transition?: string };
          if (!cfg.delayMs || cfg.delayMs <= 0) {
            issues.push({ path: `${pPath}/config/delayMs`, message: 'delayMs must be > 0.' });
          }
          if (!cfg.transition || !allTransitionNames.has(cfg.transition)) {
            issues.push({
              path: `${pPath}/config/transition`,
              message: `Scheduled transition "${cfg.transition ?? ''}" not found in workflow.`,
            });
          }
        }
        if (p.name) {
          if (seenProcNames.has(p.name)) {
            issues.push({ path: `${pPath}/name`, message: `Duplicate processor name "${p.name}".` });
          }
          seenProcNames.add(p.name);
        }
      });
    });
  }

  return issues;
}
