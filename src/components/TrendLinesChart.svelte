<script>
    import * as aq from "arquero";
    import trendData from "../data/trendData.json"
    import {line, curveBasis, curveCatmullRom} from 'd3-shape';
	import {scaleLinear, scaleUtc} from 'd3-scale';
	import {max, median, extent} from 'd3-array'
    import {schemeCategory10} from "d3-scale-chromatic";

    const height = 500
    const width = 700
    const margin = { top: 20, right: 20, bottom: 20, left: 50 }

    const trendInds = Object.keys(trendData[0]).slice(2)
    const ffInds = trendInds.slice(0, 6)
    const ffTotalInds = ffInds.slice(0, 3)
    const ffPercapInds = ffInds.slice(3, 6)

    const continents = [...new Set(trendData.map(d => d.cont))]

    $: toggleffPercap = false
    $: selectFFInds = !toggleffPercap ? ["meanTotal", ...ffTotalInds] : ["meanPerCap", ...ffPercapInds]
    let selectFFValue = ffTotalInds[0]
    
    $: linesData = aq.from(trendData)
        .derive(trendInds.reduce((obj, ind) => {
            return {...obj, [ind]: aq.escape(d => {
            if(d[ind]){
                const [b, e] = d[ind].split("e")
                return b * Math.pow(10, e)
            } 
            // else if(!!d.gdp) return 0
            })}
        }, {}))
        // World data has no values for gdp, remove data that
        // has no values for the gdp
        .filter(aq.escape(d => !!d.gdp ))
        .derive({ 
            date: aq.escape(d => new Date(d.yr, 1, 1)),
            meanTotal: aq.escape(d => ffTotalInds.reduce((mean, ind) => {
            return (mean + d[ind])/2
            }, 0)),
            meanPerCap: aq.escape(d => ffPercapInds.reduce((mean, ind) => {
            return (mean + d[ind])/2
            }, 0)),
        })
        // .relocate( "date", { before: "yr" })
        .select(aq.not("yr"))
        .objects()

    const xScaleLines = scaleLinear()
        .domain([0, 1])
        .range([margin.left, width - margin.right])

    const yScaleLines = scaleLinear()
        .domain([0, 1])
        .range([height - margin.bottom, margin.top])

    $: linePath = (keyFF, keyEcon) => line()
        // .defined(d => !isNaN(d[keyEcon]) && !isNaN(d[keyFF]))
        .curve(curveCatmullRom)
        .x(d => xScaleLines(d[keyFF]))
        .y(d => yScaleLines(d[keyEcon]))

    const SEL_ECON_IND = "gdp"

    // Every continent specific
    $: linesContiData = conti => linesData.filter(d => d["cont"] === conti)
    $: yrExtent = conti => extent(linesContiData(conti), d => d.date.getFullYear())
    $: yrMid = conti => median(linesContiData(conti), d => d.date.getFullYear())

    $: markersData = (conti) => linesContiData(conti)
        .filter(d => [...yrExtent(conti), yrMid(conti)].includes(d["date"].getFullYear()))

</script>

<div class="trend-line">
    <div class="inputs">
        <input type="checkbox" id="toggle-ff-percap" name="Show per capita value" bind:checked={toggleffPercap}>
        <label for="toggle-ff-percap">Show per capita value</label>
        <div>
            {#each selectFFInds as selectFF}
            <label>
                <input type="radio" bind:group={selectFFValue} name="ffInds" value={selectFF}>
                {selectFF}
            </label>
            {/each}
        </div>
    </div>
    <svg
        {width}
        {height}
        viewBox={`0, 0, ${width}, ${height}`}
    > 
        {#each continents as conti, i}
            <g class="paths-group">
                <path
                    class="conti-path"
                    d={linePath(selectFFValue, SEL_ECON_IND)(linesContiData(conti))}
                    stroke={schemeCategory10[i]}
                    fill="none"
                    stroke-width={1.5}
                />
            </g>
            <g class="markers-group">
                {#each markersData(conti) as mData}
                    <g class="dots-group">
                        <circle
                            cx={xScaleLines(mData[selectFFValue])}
                            cy={yScaleLines(mData[SEL_ECON_IND])}
                            r="2"
                            fill={schemeCategory10[i]}
                            stroke="none"
                        />
                    </g>
                    <g class="year-labels-group">
                        <text
                            x={xScaleLines(mData[selectFFValue])}
                            y={yScaleLines(mData[SEL_ECON_IND])}
                            fill={schemeCategory10[i]}
                            font-size="12"
                        >
                            {mData["date"].getFullYear()}
                        </text>
                    </g>
                {/each}
            </g>
        {/each}
    </svg>
</div>

<style></style>