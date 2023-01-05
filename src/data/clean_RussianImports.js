import fs from "fs"
import * as aq from "arquero"
import { compareFileSizes } from "./util.js"
const { op } = aq

const pathToCsv = "./Reliance on Russian imports.csv"
const csvData= fs.readFileSync(pathToCsv, "utf8")
const table = aq.fromCSV(csvData)

const cleaned = table.fold(table.columnNames().slice(2))
                .rename({COUNTRY: "Country",
                        PRODUCT: "Fossil_Fuel",
                        key: "Year",
                        value: "Percentage"})

const outputData = cleaned.toCSV()
fs.writeFileSync("clean_RussianImports.csv", outputData, "utf8")