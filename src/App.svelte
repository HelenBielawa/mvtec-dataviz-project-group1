<script>
  import { onMount } from "svelte";
 // import RussData from "./data/Reliance on Russian imports.csv";
  //import Russ_Imports_Multiline from "./BarChart.svelte";
  import Line from "./components/charts/Line.svelte";
  import FfRenChart from "./components/ffRenChart.svelte";
	let RussData = [{Year: 2000, Percentage: 80}, {Year: 2001, Percentage: 50}, {Year: 2002, Percentage: 30}]
	console.log(RussData)
</script>

<main>
	<h1>
		Fossil Fuel Production
	</h1>

	Here we can include our texts, styles and visuals.
	TEST CHANGE
	<Line data={RussData}
	key={{x: RussData["Year"], y: RussData["Percentage"]}}
	color="blue"
	title="How much of a countries fossil fuels come from Russia?"
	desc="Data from xy"
	layout="fossil fuels"/>
	<FfRenChart />
</main>

<style>
main{
	margin:20px;
}
h1{
	color: blue;
}
</style>