<script>
    import * as aq from "arquero";
    import trendData from "../data/trendData.json"
    import {line, curveBasis} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, extent} from 'd3-array'
    import {schemeCategory10} from "d3-scale-chromatic";

    const height = 500
    const width = 700
    const margin = { top: 20, right: 20, bottom: 20, left: 50 }

    const trendInds = Object.keys(trendData[0]).slice(2)
    const continents = [...new Set(trendData.map(d => d.cont))]

    const linesData = aq.from([...trendData])
        .derive(trendInds.reduce((obj, ind) => {
            return {...obj, [ind]: aq.escape(d => {
            if(d[ind]){
                const [b, e] = d[ind].split("e")
                return b * Math.pow(10, e)
            } else if (d[ind]) return 0
            })}
        }, {}))
        .derive({ date: aq.escape(d => new Date(d.yr, 0, 1))})
        // .relocate( "date", { before: "yr" })
        .select(aq.not("yr"))
        .objects()

    const xScaleLines = scaleLinear()
        .domain([0, 1])
        .range([margin.left, width - margin.right])

    const yScaleLines = scaleLinear()
        .domain([0, 1])
        .range([height - margin.bottom, margin.top])

    const linePath = (keyFF, keyEcon) => line()
            // .defined(d => !isNaN(d.date))
        .curve(curveBasis)
        .x(d => xScaleLines(d[keyFF]))
        .y(d => yScaleLines(d[keyEcon]))

</script>

<div class="trend-line">
    <svg
        {width}
        {height}
        viewBox={`0, 0, ${width}, ${height}`}
    >
        {#each continents as conti, i}
            <path
                d={linePath("coalprod", "gdp")(linesData.filter(d => d.cont === conti))}
                stroke={schemeCategory10[i]}
                fill="none"
                stroke-width={1.5}
            />
        {/each}
    </svg>
</div>

<style></style>