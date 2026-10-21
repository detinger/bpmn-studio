/**
 * Adapter for bpmnlint. Rules are bundled statically (no Node resolver) so the
 * linter runs in the browser, in Web Workers and in Vitest alike.
 */
import { Linter } from 'bpmnlint';
import StaticResolver from 'bpmnlint/lib/resolver/static-resolver';
import adHocSubProcess from 'bpmnlint/rules/ad-hoc-sub-process';
import endEventRequired from 'bpmnlint/rules/end-event-required';
import eventBasedGateway from 'bpmnlint/rules/event-based-gateway';
import eventSubProcessTypedStartEvent from 'bpmnlint/rules/event-sub-process-typed-start-event';
import fakeJoin from 'bpmnlint/rules/fake-join';
import labelRequired from 'bpmnlint/rules/label-required';
import linkEvent from 'bpmnlint/rules/link-event';
import noBpmndi from 'bpmnlint/rules/no-bpmndi';
import noDisconnected from 'bpmnlint/rules/no-disconnected';
import noDuplicateSequenceFlows from 'bpmnlint/rules/no-duplicate-sequence-flows';
import noGatewayJoinFork from 'bpmnlint/rules/no-gateway-join-fork';
import noImplicitSplit from 'bpmnlint/rules/no-implicit-split';
import noImplicitEnd from 'bpmnlint/rules/no-implicit-end';
import noImplicitStart from 'bpmnlint/rules/no-implicit-start';
import noOverlappingElements from 'bpmnlint/rules/no-overlapping-elements';
import singleBlankStartEvent from 'bpmnlint/rules/single-blank-start-event';
import singleEventDefinition from 'bpmnlint/rules/single-event-definition';
import startEventRequired from 'bpmnlint/rules/start-event-required';
import subProcessBlankStartEvent from 'bpmnlint/rules/sub-process-blank-start-event';
import superfluousGateway from 'bpmnlint/rules/superfluous-gateway';
import superfluousLabel from 'bpmnlint/rules/superfluous-label';
import superfluousTermination from 'bpmnlint/rules/superfluous-termination';
import { BPMNLINT_RULES } from './catalog';

const RULE_FACTORIES: Record<(typeof BPMNLINT_RULES)[number], unknown> = {
  'ad-hoc-sub-process': adHocSubProcess,
  'end-event-required': endEventRequired,
  'event-based-gateway': eventBasedGateway,
  'event-sub-process-typed-start-event': eventSubProcessTypedStartEvent,
  'fake-join': fakeJoin,
  'label-required': labelRequired,
  'link-event': linkEvent,
  'no-bpmndi': noBpmndi,
  'no-disconnected': noDisconnected,
  'no-duplicate-sequence-flows': noDuplicateSequenceFlows,
  'no-gateway-join-fork': noGatewayJoinFork,
  'no-implicit-split': noImplicitSplit,
  'no-implicit-end': noImplicitEnd,
  'no-implicit-start': noImplicitStart,
  'no-overlapping-elements': noOverlappingElements,
  'single-blank-start-event': singleBlankStartEvent,
  'single-event-definition': singleEventDefinition,
  'start-event-required': startEventRequired,
  'sub-process-blank-start-event': subProcessBlankStartEvent,
  'superfluous-gateway': superfluousGateway,
  'superfluous-label': superfluousLabel,
  'superfluous-termination': superfluousTermination
};

export interface LintReport {
  rule: string;
  id: string;
  message: string;
}

/**
 * A fresh linter per run: some bpmnlint rules keep state in their factory
 * closure (e.g. no-duplicate-sequence-flows), so rule instances must not be
 * shared between models.
 */
function createLinter() {
  const cache: Record<string, unknown> = {};
  for (const [name, factory] of Object.entries(RULE_FACTORIES)) cache[`rule:bpmnlint/${name}`] = factory;
  return new Linter({
    resolver: new StaticResolver(cache),
    config: { rules: Object.fromEntries(BPMNLINT_RULES.map((r) => [r, 'warn'])) }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runBpmnlint(definitions: any): Promise<LintReport[]> {
  const results: Record<string, Array<{ id: string; message: string }>> = await createLinter().lint(definitions);
  const out: LintReport[] = [];
  for (const [rule, reports] of Object.entries(results)) {
    for (const r of reports) out.push({ rule, id: r.id, message: r.message });
  }
  return out;
}
