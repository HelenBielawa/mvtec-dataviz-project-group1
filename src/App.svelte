<script>
	import { onMount } from "svelte";
 	import TestChart from "./components/charts/TestChart.svelte";
	import FFRenChart from "./components/FFRenChart.svelte";
	const RussData = [{Year: "2000", Percentage: 80}, {Year: "2001", Percentage: 50}, {Year: "2002", Percentage: 30}]
</script>

<main>
	<h1>
		Fossil Fuel Production
	</h1>

	<p>Here we can include our texts, styles and visuals.</p>

	<TestChart data = {RussData}/>

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