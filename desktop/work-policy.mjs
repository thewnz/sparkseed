import { createHash } from 'node:crypto';
import { workRuleLabels } from '../src/work-labels.mjs';

export const workModes = ['off', 'record', 'act'];

/** The rules a work item may rely on. Explicit requests need no rule. */
export const workRuleIds = Object.keys(workRuleLabels);

export function normalizeWorkPolicy(input = {}) {
  const rules = {};
  for (const id of workRuleIds) rules[id] = input.rules?.[id] !== false;
  return { mode: workModes.includes(input.mode) ? input.mode : 'record', rules };
}

/** One identifier for the rule set and accept mode, recorded on every mandate. */
export function workPolicyVersion(policy) {
  const normalized = normalizeWorkPolicy(policy);
  const enabled = workRuleIds.filter(id => normalized.rules[id]);
  return createHash('sha256').update(JSON.stringify({ version: 1, mode: normalized.mode, rules: enabled }))
    .digest('hex').slice(0, 16);
}

/** Immutable authorization for one work item. It records why the work may run. */
export function workMandate({ policy, strength = 'inferred', rules = [], revision = '', source = 'local', subject = '' }) {
  const normalized = normalizeWorkPolicy(policy);
  return {
    strength, rules: rules.filter(id => workRuleIds.includes(id)), source, subject, revision,
    policyVersion: workPolicyVersion(normalized), createdAt: new Date().toISOString(),
  };
}

/** An explicit mandate always holds; an inferred one needs auto mode and its rules still enabled. */
export function revalidateWorkMandate(mandate, policy) {
  if (!mandate) return true;
  if (mandate.strength === 'explicit') return true;
  const normalized = normalizeWorkPolicy(policy);
  if (normalized.mode !== 'act') return false;
  return (mandate.rules || []).every(id => normalized.rules[id] !== false);
}

/** Whether a policy change bears on an open item and, if so, what changed. It never revokes live work. */
export function workPolicyEffect(mandate, from, to) {
  if (!mandate) return null;
  const before = normalizeWorkPolicy(from);
  const after = normalizeWorkPolicy(to);
  const rules = (mandate.rules || []).filter(id => before.rules[id] !== after.rules[id]);
  const proactive = mandate.strength !== 'explicit' && before.mode === 'act' && after.mode !== 'act';
  if (!rules.length && !proactive) return null;
  return {
    from: workPolicyVersion(before),
    to: workPolicyVersion(after),
    rules: rules.map(id => ({ id, enabled: after.rules[id] !== false })),
    proactive: proactive || undefined,
  };
}
