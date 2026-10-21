/* Type declarations for untyped third-party modules. */

declare module 'bpmnlint' {
  export class Linter {
    constructor(options: { resolver: unknown; config?: unknown });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lint(definitions: any, config?: unknown): Promise<Record<string, Array<{ id: string; message: string; category?: string }>>>;
  }
}

declare module 'bpmnlint/lib/resolver/static-resolver' {
  export default class StaticResolver {
    constructor(cache: Record<string, unknown>);
  }
}

declare module 'bpmnlint/rules/*' {
  const factory: unknown;
  export default factory;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'bpmn-js-token-simulation' {
  const module: any;
  export default module;
}

declare module 'bpmn-js-token-simulation/lib/modeler' {
  const module: any;
  export default module;
}

declare module 'bpmn-js-token-simulation/lib/viewer' {
  const module: any;
  export default module;
}

declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
}

declare module 'bpmn-moddle' {
  export function BpmnModdle(packages?: Record<string, unknown>, options?: Record<string, unknown>): any;
}
