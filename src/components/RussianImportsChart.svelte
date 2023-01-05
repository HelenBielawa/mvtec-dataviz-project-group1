<script>
    import * as aq from "arquero";
    import RUdata from "../data/clean_RussianImports.json"
    import {line, curveBasis} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, extent} from 'd3-array'
  import { loop_guard } from "svelte/internal";


    export let filter;
    const height = 500
    const width = 700
    const margin = { top: 20, right: 20, bottom: 20, left: 50 }

    const innerHeight = height - margin.top - margin.bottom;
    const innerWidth = width - margin.left - margin.right;

    const data = RUdata.filter(d => d.Fossil_Fuel == filter)
    const countries = [...new Set(data.map(d => d.Country))]
    console.log(countries)
    const xScale = scaleLinear()
        .domain([1990, 2021])
        .range([margin.left, width - margin.right])

    const yScale = scaleLinear()
        .domain([0, 100])
        .range([height - margin.bottom, margin.top])
    console.log(data.map(d=>d.Year)[0])

    const linePath = (keyFF, keyEcon) => line()
        .curve(curveBasis)
        .x(d => xScale(d[keyFF]))
        .y(d => yScale(d[keyEcon]))
    
</script>

<div class="imports-line">
    <h3>Do what degree to countries rely on gas imports from Russia?</h3>
    <svg
        {width}
        {height}
        viewBox={[0, 0, width, height]}>
        <g>
            <!--use Svelte html looping to iterate over all ticks and create axis-->
        {#each xScale.ticks() as tickValue}
            <!--move along the x axis according to calculation by xScale, move 0 at yAxis-->
            <g transform={`translate(${xScale(tickValue)},0)`}>
            <line y2={innerHeight} stroke="black" />
            <text text-anchor="middle" dy=".71em" y={innerHeight + 3}>
            {tickValue}
            </text>
            </g>
        {/each}



        {#each countries as conti, i}
            <path
                d={linePath("Year", "Percentage")(data.filter(d => d.Country === conti))}
                stroke="blue"
                fill="none"
                stroke-width={1.5}
            />
        {/each}
        </g>
    
    </svg>
</div>

<style></style>