<script>
    import * as aq from "arquero";
    import ffRenData from "../data/ffRenData.json"
    import {area, stack} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, min, extent, range} from 'd3-array'
    import {schemeCategory10} from "d3-scale-chromatic";

    const indicators = Object.keys(ffRenData[0])
        .slice(1)
        .filter(ind => !ind.includes("percap")) 
    const indicatorsPercap = Object.keys(ffRenData[0])
        .slice(1)
        .filter(ind => ind.includes("percap"))

    const width = 600
    const height = 400
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
          date: aq.escape(d => new Date(d.year, 0, 1)),
          total: aq.escape(d => indicatorsUsed.reduce((sum, ind) => {
            return sum + d[ind]
          }, 0))
        })
        // .relocate( "date", { before: "year" } )
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

    $: sDates = seriesData[0].map(d => d.data.date)
    $: sYears = sDates.map(date => date.getFullYear())

    $: areaPath = area()
        .x((d, i) => x(sDates[i]))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))

    $: yMax = max(areaData, d => indicatorsUsed.reduce((sum, ind) => {
      return sum + d[ind]
    }, 0))

    $: yValRange = range(0, yMax, yMax/5).map(y => Math.round(y.toFixed()/10000)*10000)

    $: xRev = scaleUtc()
        .domain([margin.left, width - margin.right])
        .range(extent(areaData, d => d.date))

    let ttVisibility = "hidden"
    const X_OFFSET = 500
    $: year = 1900
    $: sIndex = 0
    $: isCursorOnRight = false
    $: mouseX = 0
    $: mouseY = 0

    $: pointX = (sdpt) => sIndex > 0 ? x(sdpt[sIndex].data.date) : x(new Date(2000, 0, 1))
    $: pointY = (sdpt) => sIndex > 0 ? y(sdpt[sIndex][1]) : y(0)

    function handleMouseOver () {
        ttVisibility = "visible"
    }

    function handleMouseMove(e) {
        const {pageX, pageY} = e
        mouseX = pageX - X_OFFSET
        mouseY = pageY

        year = xRev(mouseX).getFullYear()
        sIndex = sYears.indexOf(year)
        isCursorOnRight = mouseX > x(width / 2)

        const isXWithinRange =  year > min(sYears) && year < max(sYears)
        ttVisibility = isXWithinRange ? "visible" : "hidden"
    }

    function handleMouseOut() {
        ttVisibility = "hidden"
    }

    $: getTooltipText = (sData, i) => {
        const ind = indicatorsUsed[i]
        const valFixed = sIndex >= 0 ? sData[sIndex].data[ind].toFixed(0) : 0
        const valRound = Math.round(valFixed / 100) * 100
        const perc = sIndex >= 0 ? ((valFixed / sData[sIndex].data.total) * 100).toPrecision(2) : 0
        return `${ind}: ${valRound} (${perc}%)`
    }

    // To prevent throwing an error where mouseover and mouseout requires
    // accompanying onfocus and onblur
    function handleFocus() {}
    function handleBlur() {}

</script>

<div class="area-chart">
    <!-- <div class="checkbox-container">
        <input type="checkbox" name="gdpPerCapCheck" bind:value={togglePercap}>
        <label>Show GDP per capita values</label>
    </div> -->
    <svg
        class="svg-area-chart"
        viewBox='0 0 {width} {height}'
        {width}
        {height}
        on:mouseover={handleMouseOver}
        on:mousemove={handleMouseMove}
        on:mouseout={handleMouseOut}
        on:focus={handleFocus}
        on:blur={handleBlur}
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
            {#each seriesData as sData, i}
                <text
                    class="tt-indicator"
                    x={isCursorOnRight ? mouseX - 10 : mouseX + 10}
                    y="40"
                    text-anchor={isCursorOnRight ? "end" : "start"}
                    dy={(i + 1) * 20}
                    visibility={ttVisibility}
                >
                    {getTooltipText(sData, i)}
                </text>
            {/each}
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
        </g>
        <g class="axes">
            <g class="x-axis">
                <line
                    class="horizontal-line"
                    x1={0}
                    x2={width}
                    y1={height - margin.top}
                    y2={height - margin.top}
                    stroke="#333333"
                    stroke-width="1"
                />
                {#each sDates.filter(dt => dt.getFullYear() % 20 === 0) as date}
                    <g class="x-tick">
                        <text
                            class="x-tick-label"
                            x={x(date)}
                            y={height}
                            text-anchor="middle"
                        >
                            {date.getFullYear()}    
                        </text>
                    </g>
                {/each}
            </g>
            <g class="y-axis">
                {#each yValRange as yVal}
                    <g class="y-tick">
                        <text
                            class="y-tick-label"
                            x={0}
                            y={height - y(yVal) + margin.top}
                            dy="18"
                        >
                        {yVal}
                        </text>
                        <line
                            class="y-tick-line"
                            x1={0}
                            x2={width}
                            y1={height - y(yVal) + margin.top}
                            y2={height - y(yVal) + margin.top}
                            stroke="#cccccc"
                            stroke-width="0.5"
                        />
                    </g>
                {/each}
            </g>
        </g>
    </svg>
</div>

<style>
.area-chart {
    display: block;
    height: 400px;
    width: 100%;
	margin: 0 0 2em 0;
}
</style>