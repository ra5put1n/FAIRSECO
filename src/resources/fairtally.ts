/**
 * This module contains a function that runs the [fairtally](https://github.com/fair-software/fairtally) Docker image and parses it to JSON.
 * 
 * @module
 */

import { GitHubInfo } from "../git";
import * as dockerExit from "../errorhandling/docker_exit";
import { ErrorLevel, LogMessage } from "../errorhandling/log";

import { exec, ExecOptions } from "@actions/exec";
import fs from "fs";

/** The name of the module. */
export const ModuleName = "fairtally";

/**
 * Runs the fairtally docker image on the current repo,
 * and gives the checklist of FAIRness criteria.
 * 
 * @param params The parameters passed by getData. It should contain a `GitHubInfo` object with information about the GitHub repository.
 * @returns The result object from fairtally.
 */
export async function runModule(params: any[]): Promise<any> {
    if (params.length < 1)
        throw new Error("Too few arguments passed to " + ModuleName + "'s runModule function");

    const ghInfo = params[0] as GitHubInfo;

    const cmd = "docker";
    const args = [
        "run",
        "--rm",
        "fairsoftware/fairtally",
        "--format",
        "json",
        "-o",
        "-",
        ghInfo.FullURL,
    ];

    // Output from the docker container
    let stdout = "";

    try {
        if (!fs.existsSync("./hfiOutputFiles"))
            fs.mkdirSync("./hfiOutputFiles/");
        else
            LogMessage("Directory hfiOutputFiles already exists!", ErrorLevel.info);
    } catch {
        LogMessage("Could not create hfiOutputFiles directory.", ErrorLevel.err);
    }

    const stdOutStream = fs.createWriteStream("./hfiOutputFiles/hfiOutput.txt");
    const stdErrStream = fs.createWriteStream("./hfiOutputFiles/hfiError.txt");

    const options: ExecOptions = {
        ignoreReturnCode: true,
        windowsVerbatimArguments: true,
        outStream: stdOutStream,
        errStream: stdErrStream,
    };

    options.listeners = {
        stdout: (data: Buffer) => {
            stdout += data.toString();
        }
    };
    // Run fairtally in Docker
    LogMessage("Starting Docker program: fairtally", ErrorLevel.info);
    const exitCode = await exec(cmd, args, options);

    // Check Docker exit code
    dockerExit.throwError("fairtally", exitCode);

    // Parse the JSON output
    try {
        return JSON.parse(stdout);
    } catch {
        throw new Error("Run output is not valid JSON");
    }
}
