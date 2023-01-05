<script>
    import * as aq from "arquero";
    import ffRenData from "../data/ffRenData.json"
    import locale from '@reuters-graphics/d3-locale';
    import weather from '../data/weather.json';
    import {area, curveStep, stack} from 'd3-shape';
	import {scaleTime, scaleLinear, scaleUtc} from 'd3-scale';
	import {max, extent, bisector} from 'd3-array'
    import {schemeCategory10} from "d3-scale-chromatic"

    const keys = Object.keys(ffRenData[0])
    const indicators = keys.slice(1)
        .filter(ind => !ind.includes("percap") && !ind.includes("renewable"))
    const indicatorsPercap = Object.keys(ffRenData[0])
        .slice(1)
        .filter(ind => ind.includes("percap") && !ind.includes("renewable"))
    const areaData = aq.from(ffRenData)
        .derive(indicators.reduce((obj, ind) => {
          return {...obj, [ind]: aq.escape(d => {
            const [b, e] = d[ind].split("e+")
            return b * Math.pow(10, e)
          })}
        }, {}))
        .derive({ date: aq.escape(d => new Date(d.year, 1, 1))})
        .relocate( "date", { before: "year" } )
        .select(aq.not(indicatorsPercap, "year", "renewable", "renewablepercap"))
        .orderby("date")
        .objects()

    const width = 700
    const height = 500
    const margin = {top: 20, right: 20, bottom: 20, left: 50};

    const x = scaleUtc()
        .domain(extent(areaData, d => d.date))
        .range([margin.left, width - margin.right])

    const y = scaleLinear()
        .domain([0, max(areaData, d => indicators.reduce((sum, ind) => {
            return sum + d[ind]
        }, 0))]).nice()
        .range([height - margin.bottom, margin.top])

    // const xAxis = g => g
    //     .attr("transform", `translate(${margin.left},${height - margin.bottom})`)
    //     .call(d3.axisBottom(x))

    // const yAxis = g => g
    //     .attr("transform", `translate(${margin.left},0)`)
    //     .call(d3.axisLeft(y))

    const seriesData = stack()
        .keys(indicators)(areaData)

    const areaPath = area()
        .x((d, i) => x(areaData[i].date))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))

    // const svg = d3.create("svg")
    //   .attr("width", width)
    //   .attr("height", height);

    // svg.append("g")
    //     .call(xAxis);

    // svg.append("g")
    //     .call(yAxis);

</script>

<div class="area-chart">
    <h3>Fossil fuel and renewable chart</h3>
    <svg
        viewBox='0 0 {width - margin.right - margin.left} {height}'
        {width}
        {height}
    >
        <g class="area-paths">
            {#each seriesData as indData, i}
                <path 
                    d={areaPath(indData)}
                    fill={schemeCategory10[i]}
                />
            {/each}
        </g>
    </svg>
</div>

<style>
.area-chart {
    height: 100px;
    width: 700px;
	padding: 1em;
	margin: 0 0 2em 0;
}
</style>