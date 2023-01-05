declare namespace _default {
    export const row_number: WindowDef;
    export { rank };
    export const avg_rank: WindowDef;
    export const dense_rank: WindowDef;
    export const percent_rank: WindowDef;
    export { cume_dist };
    export const ntile: WindowDef;
    export const lag: WindowDef;
    export const lead: WindowDef;
    export const first_value: WindowDef;
    export const last_value: WindowDef;
    export const nth_value: WindowDef;
    export const fill_down: WindowDef;
    export const fill_up: WindowDef;
}
export default _default;
/**
 * Initialize a window operator.
 */
export type WindowInit = () => void;
/**
 * Retrieve an output value from a window operator.
 */
export type WindowValue = (state: WindowState) => any;
/**
 * An operator instance for a window function.
 */
export type WindowOperator = {
    /**
     * Initialize the operator.
     */
    init: AggregateInit;
    /**
     * Retrieve an output value.
     */
    value: AggregateValue;
};
/**
 * Create a new window operator instance.
 */
export type WindowCreate = (...params: any[]) => WindowOperator;
/**
 * An operator definition for a window function.
 */
export type WindowDef = {
    /**
     * Create a new operator instance.
     */
    create: AggregateCreate;
    /**
     * Two-element array containing the
     * counts of input fields and additional parameters.
     */
    param: number[];
};
declare namespace rank {
    function create(): {
        init: () => number;
        value: (w: any) => any;
    };
    function create(): {
        init: () => number;
        value: (w: any) => any;
    };
    const param: any[];
}
declare namespace cume_dist {
    export function create(): {
        init: () => number;
        value: (w: any) => number;
    };
    export function create(): {
        init: () => number;
        value: (w: any) => number;
    };
    const param_1: any[];
    export { param_1 as param };
}
