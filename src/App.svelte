<script>
  import { onMount } from "svelte";
 // import RussData from "./data/Reliance on Russian imports.csv";
  //import Russ_Imports_Multiline from "./BarChart.svelte";
  import Line from "./components/charts/Line.svelte";
  import FfRenChart from "./components/FFRenChart.svelte";
  import TrendLinesChart from "./components/TrendLinesChart.svelte";
  import RussianImportsChart from "./components/RussianImportsChart.svelte";

	let importFilter = "Natural Gas";
	function changeImportFilter(choice) {
        if (choice == "Natural Gas") {
            importFilter = "Natural Gas";
        } else if (choice == "Coal"){
            importFilter = "Coal";
			console.log("Coal")
        } else if (choice == "Oil"){
            importFilter = "Oil";
			console.log("Oil")
        }
    }
</script>

<!-- svelte-ignore missing-declaration -->
<main>
	<h1>
		Fossil Fuel Production
	</h1>

	Here we can include our texts, styles and visuals.

	<FfRenChart />
	<TrendLinesChart />

	<button on:click={() => changeImportFilter("Natural Gas")}>Gas</button>
	<button on:click={() => changeImportFilter("Coal")}>Coal</button>
	<button on:click={() => changeImportFilter("Oil")}>Oil</button>

	<RussianImportsChart filter = {importFilter} highlight = "Germany"/>

</main>

<style>
main{
	margin:20px;
}
h1{
	color: blue;
}
</style>