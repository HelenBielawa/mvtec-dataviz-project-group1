<script>
    import * as aq from "arquero";
    import {line, curveBasis} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, extent} from 'd3-array'
    import RUdata from "../data/clean_RussianImports.json";
    
    export let filter;
    export let highlight;
    
    const height = 500
    const width = 700
    const margin = { top: 20, right: 20, bottom: 20, left: 60 }

    const innerHeight = height - margin.top - margin.bottom;
    const innerWidth = width - margin.left - margin.right;

    let colour = "black";
    let opacity = "0.0";

    $: data = RUdata.filter(d => d.Fossil_Fuel == filter)
    $: countries = [...new Set(data.map(d => d.Country))]

    $: xScale = scaleLinear()
        .domain([1990, 2021])
        .range([margin.left, width - margin.right])

    $: yScale = scaleLinear()
        .domain([0, max(data.map(d => d.Percentage))])
        .range([height - margin.bottom, margin.top])

    $: colorScale = (country) => {if (country == highlight) {
        return "blue"
    } else {
        return "grey"
    }}

    $: strokeScale = (country) => {if (country == highlight) {
        return 2.5;
    } else {
        return 1.5;
    }}

    $: linePath = (keyFF, keyEcon) => line()
        .curve(curveBasis)
        .x(d => xScale(d[keyFF]))
        .y(d => yScale(d[keyEcon]))
   
    function handleMouseOver(e) {
		colour = "black";
        opacity = "1.0"
	}
	function handleMouseOut(e) {
		colour = 'white';
        opacity = "0.0"
	}

</script>

<div class="imports-line">
    <h3>Do what degree to countries rely on {filter} imports from Russia?</h3>
    <svg
        {width}
        {height}
        viewBox={[0, 0, width, height]}>
        <g>
            <!--use Svelte html looping to iterate over all ticks and create axis-->
        {#each [1990, 1995, 2000, 2005, 2010, 2015, 2020] as tickValue}
            <!--move along the x axis according to calculation by xScale, move 0 at yAxis-->
            <g transform={`translate(${xScale(tickValue)},0)`}>
            <line y2={innerHeight} stroke="black" />
            <text text-anchor="middle" dy="1.71em" y={innerHeight}>
            {tickValue}
            </text>
            </g>
        {/each}

        {#each yScale.ticks() as tickValue}
            {#if tickValue}
                <g transform={`translate(0,${yScale(tickValue)})`}>
                <text text-anchor="end" dy=".71em" x={margin.left}>
                    {tickValue}
                </text>
                </g>
            {/if}
        {/each}
     
        <text text-anchor="end" dy=".71em" x={margin.left} y={margin.top}>%</text>
      <!--  <text text-anchor="end" dy=".71em" x={width} y={height - margin.bottom}>Year</text>-->
        {#each countries as country, i}
            <path
                d={linePath("Year", "Percentage")(data.filter(d => d.Country === country))}
                stroke={colorScale(country)}
                fill="none"
                stroke-width={strokeScale(country)}
            />

            <text text-anchor="end"
            x={width - margin.right}
            y={yScale(data.filter(d => d.Country === country && d.Year === 2020)[0].Percentage)}
            color = {colour}
            opacity={opacity}
            on:mouseover={handleMouseOver}
            on:mouseout={handleMouseOut}>{country}</text>                
        {/each}
        </g>
    </svg>
</div>

<style></style>