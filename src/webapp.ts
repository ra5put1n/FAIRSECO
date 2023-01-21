/**
 * This module contains a function that handles the creation of the HTML file. It compiles the EJS files into
 * an HTML file, and inserts the data generated by the program.
 * 
 * @module
 */

import * as fs from "fs";
import { ReturnObject } from "./getdata";
import ejs from "ejs";

/**
 * Creates a webapp that reports the data gathered by FAIRSECO.
 * 
 * @param data The gathered data.
 * @param filePath The path to which the HTML file will be written.
 */
export async function WriteHTML(
    data: ReturnObject[],
    filePath: string
): Promise<void> {
    console.log(JSON.stringify(data));
    const template = await ejs.renderFile("./templates/index.ejs", { data });
    const app = template.replace(
        "{{node inserts the data here}}",
        JSON.stringify(data)
    );

    await fs.promises.writeFile(filePath, app, "utf8");
}