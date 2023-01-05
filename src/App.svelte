<script>
  import { onMount } from "svelte";
 // import RussData from "./data/Reliance on Russian imports.csv";
  //import Russ_Imports_Multiline from "./BarChart.svelte";
  import Line from "./components/charts/Line.svelte";
  import FfRenChart from "./components/FFRenChart.svelte";
  import TrendLinesChart from "./components/TrendLinesChart.svelte";
  import RussianImportsChart from "./components/RussianImportsChart.svelte";
  import ShowValue from "./components/ShowValue.svelte";

	var importsFilter = "Natural Gas";
	function changeImportFilter(choice) {
        if (choice == "Natural Gas") {
            importsFilter = "Natural Gas";
        } else if (choice == "Coal"){
            value = "Coal";
        } else if (choice == "Oil"){
            value = "Oil";
        }
    }
</script>

<main>
	<h1>
		Fossil Fuel Production
	</h1>

	Here we can include our texts, styles and visuals.
	TEST CHANGE

	<FfRenChart />
	<TrendLinesChart />

	<button id="1" onclick="changeVal('Natural Gas')">Gas</button>
	<button id="2" onclick="changeVal('Coal')">Coal</button>
	<button id="3" onclick="changeVal('Oil')">Oil</button>
	You chose 	<ShowValue name="Fossil Fuel" value={importsFilter}/>

	$<RussianImportsChart filter = {importsFilter}/>

</main>

<style>
main{
	margin:20px;
}
h1{
	color: blue;
}
</style>