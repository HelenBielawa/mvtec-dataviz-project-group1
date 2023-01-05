declare namespace _default {
    const count: AggregateDef;
    const array_agg: AggregateDef;
    const object_agg: AggregateDef;
    const map_agg: AggregateDef;
    const entries_agg: AggregateDef;
    const any: AggregateDef;
    const valid: AggregateDef;
    const invalid: AggregateDef;
    const distinct: AggregateDef;
    const array_agg_distinct: AggregateDef;
    const mode: AggregateDef;
    const sum: AggregateDef;
    const product: AggregateDef;
    const mean: AggregateDef;
    const average: AggregateDef;
    const variance: AggregateDef;
    const variancep: AggregateDef;
    const stdev: AggregateDef;
    const stdevp: AggregateDef;
    const min: AggregateDef;
    const max: AggregateDef;
    const quantile: AggregateDef;
    const median: AggregateDef;
    const covariance: AggregateDef;
    const covariancep: AggregateDef;
    const corr: AggregateDef;
    const bins: AggregateDef;
}
export default _default;
/**
 * Initialize an aggregate operator.
 */
export type AggregateInit = (state: object) => void;
/**
 * Add a value to an aggregate operator.
 */
export type AggregateAdd = (state: object, value: any) => void;
/**
 * Remove a value from an aggregate operator.
 */
export type AggregateRem = (state: object, value: any) => void;
/**
 * Retrive an output value from an aggregate operator.
 */
export type AggregateValue = (state: object) => any;
/**
 * An operator instance for an aggregate function.
 */
export type AggregateOperator = {
    /**
     * Initialize the operator.
     */
    init: AggregateInit;
    /**
     * Add a value to the operator state.
     */
    add: AggregateAdd;
    /**
     * Remove a value from the operator state.
     */
    rem: AggregateRem;
    /**
     * Retrieve an output value.
     */
    value: AggregateValue;
};
/**
 * Create a new aggregate operator instance.
 */
export type AggregateCreate = (...params: any[]) => AggregateOperator;
/**
 * An operator definition for an aggregate function.
 */
export type AggregateDef = {
    /**
     * Create a new operator instance.
     */
    create: AggregateCreate;
    /**
     * Two-element array containing the
     * counts of input fields and additional parameters.
     */
    param: number[];
    /**
     * Names of operators required by this one.
     */
    req?: string[];
    /**
     * Names of operators required by this one
     * for streaming operations (value removes).
     */
    stream?: string[];
};
