<script>
  import { onMount } from "svelte";
  //import RussData from "./data/Reliance on Russian imports.csv";
  //import Russ_Imports_Multiline from "./BarChart.svelte";
  import FFRenChart from "./components/FFRenChart.svelte";

</script>

<main>
	<h1>
		Fossil Fuel Production
	</h1>

Here we can include our texts, styles and visuals.
TEST CHANGE

	<FFRenChart />

</main>

<style>
main{
	margin:20px;
}
h1{
	color: blue;
}
</style>