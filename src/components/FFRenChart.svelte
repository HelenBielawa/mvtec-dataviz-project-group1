<script>
    import { onMount } from "svelte";
    import * as aq from "arquero";
    import ffRenData from "../data/ffRenData.json"
    import {area, stack} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, extent} from 'd3-array'
    import {schemeCategory10} from "d3-scale-chromatic";

    const indicators = Object.keys(ffRenData[0])
        .slice(1)
        .filter(ind => !ind.includes("percap")) 
    const indicatorsPercap = Object.keys(ffRenData[0])
        .slice(1)
        .filter(ind => ind.includes("percap") && !ind.includes("renewable"))

    const width = 700
    const height = 500
    const margin = {top: 20, right: 20, bottom: 20, left: 50};
    
    let togglePercap = false;

    let indicatorsUsed = !togglePercap ? indicators : indicatorsPercap

    $: areaData = aq.from(ffRenData)
        .derive(indicatorsUsed.reduce((obj, ind) => {
          return {...obj, [ind]: aq.escape(d => {
            if(d[ind]){
              const [b, e] = d[ind].split("e")
              return b * Math.pow(10, e)
            } else return 0
          })}
        }, {}))
        .derive({ 
          date: aq.escape(d => new Date(d.year, 1, 1)),
          total: aq.escape(d => indicatorsUsed.reduce((sum, ind) => {
            return sum + d[ind]
          }, 0))
        })
        .relocate( "date", { before: "year" } )
        .select(aq.not((!togglePercap ? indicatorsPercap : indicators), "year"))
        .orderby("date")
        .objects()

    $: x = scaleUtc()
        .domain(extent(areaData, d => d.date))
        .range([margin.left, width - margin.right])

    $: y = scaleLinear()
        .domain([0, max(areaData, d => indicators.reduce((sum, ind) => {
            return sum + d[ind]
        }, 0))]).nice()
        .range([height - margin.bottom, margin.top])

    $: seriesData = stack()
        .keys(indicatorsUsed)(areaData)
        .map(sData => sData.map((d, i) => {
            return {...d, data: areaData[i]}
        }))

    $: areaPath = area()
        .x((d, i) => x(areaData[i].date))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))

    $: yMax = max(areaData, d => indicatorsUsed.reduce((sum, ind) => {
      return sum + d[ind]
    }, 0))

    $: xRev = scaleUtc()
        .domain([margin.left, width - margin.right])
        .range(extent(areaData, d => d.date))

    $: sYears = seriesData[0].map(d => d.data.date.getFullYear())

    let ttVisibility = "hidden"
    $: year = 1900
    $: sIndex = 0
    $: isCursorOnRight = false
    $: mouseX = 0
    $: mouseY = 0

    $: pointX = (sdpt) => x(sdpt[sIndex].data.date) || x(new Date(2000, 0, 1))
    $: pointY = (sdpt) => y(sdpt[sIndex][1]) || y(0)

    function handleMouseOver () {
        ttVisibility = "visible"
    }

    function handleMouseMove(e) {
        const {pageX, pageY} = e
        mouseX = pageX
        mouseY = pageY

        ttVisibility = "visible"

        year = xRev(pageX).getFullYear()
        sIndex = sYears.indexOf(year)
        isCursorOnRight = pageX > x(width / 2)
    }

    function handleMouseOut() {
        ttVisibility = "hidden"
    }

    function getTooltipText(sdtt, i) {
        const ind = indicatorsUsed[i]
        const valFixed = sdtt[sIndex].data[ind].toFixed(0)
        const valRound = Math.round(valFixed / 100) * 100
        const perc = ((valFixed / sdtt[sIndex].data.total) * 100).toPrecision(2)
        return `${ind}: ${valRound} (${perc}%)`
    }

</script>

<div class="area-chart">
    <h3>Renewable energy production remains insignificant compared to total fossil fuel production</h3>
    <svg
        viewBox='0 0 {width - margin.right - margin.left} {height}'
        {width}
        {height}
        on:mouseover={handleMouseOver}
        on:mousemove={handleMouseMove}
        on:mouseout={handleMouseOut}
    >
        <g class="paths-group">
            {#each seriesData as sData, i}
                <path 
                    d={areaPath(sData)}
                    fill={schemeCategory10[i]}
                    class="path"
                />
            {/each}
        </g>
        <g class="tooltip">
            <text
                class="tt-year"
                x={isCursorOnRight ? mouseX - 10 : mouseX + 10}
                y="15"
                text-anchor={isCursorOnRight ? "end" : "start"}
                visibility={ttVisibility}
            >
                {year}
            </text>
            {#each seriesData as sdtt, i}
                <text
                    class="tt-indicator"
                    x={isCursorOnRight ? mouseX - 10 : mouseX + 10}
                    y="40"
                    text-anchor={isCursorOnRight ? "end" : "start"}
                    dy={(i + 1) * 20}
                    visibility={ttVisibility}
                >
                    {getTooltipText(sdtt, i)}
                </text>
            {/each}
        </g>
        <g class="vline">
            <line 
                x1={mouseX - 2.5}
                x2={mouseY - 2.5}
                y1="0"
                y2={yMax}
                stroke="#000000"
                opacity="0.5"
                visibility={ttVisibility}
            />
        </g>
        <g class="points-group">
            {#each seriesData as sdpt}
                <circle
                    r="5"
                    cx={pointX(sdpt)}
                    cy={pointY(sdpt)}
                    stroke="#000000"
                    fill="none"
                    visibility={ttVisibility}
                />
            {/each}
        </g>
    </svg>
</div>

<style>
.area-chart {
    display: block;
    height: 700px;
    width: 700px;
	padding: 1em;
	margin: 0 0 2em 0;
}
</style>