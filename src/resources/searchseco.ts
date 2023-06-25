/*
This program has been developed by students from the bachelor Computer Science at
Utrecht University within the Software Project course.
© Copyright Utrecht University (Department of Information and Computing Sciences)
 */

/**
 * This module contains functions that run the SearchSECO Docker image and parses its output.
 *
 * @remarks
 * If the action is run on a private repository, SearchSECO will be unable
 * to analyze the code. To circumvent this, a mock of SearchSECO was created
 * ([jarnohendriksen/MockSECO:v1](https://hub.docker.com/r/jarnohendriksen/mockseco)).
 *
 * @module
 */

import { GitHubInfo } from "../git";
import { ErrorLevel, LogMessage } from "../errorhandling/log";
import { throwError } from "../errorhandling/docker_exit";

import * as fs from "fs";
import { exec, ExecOptions } from "@actions/exec";

/** The name of the module. */
export const ModuleName = "SearchSECO";

/**
 * This function first runs the SearchSECO Docker and listens to stdout for its output.
 * Then, it tries to parse whatever SearchSECO returned into an {@link Output} object.
 *
 * @param ghInfo Information about the GitHub repository.
 * @returns The object constructed from SearchSECO's output.
 */
export async function runModule(ghInfo: GitHubInfo): Promise<Output> {
    const gitrepo: string = ghInfo.FullURL;
    const useMock = ghInfo.Visibility !== "public";

    // Determine which Docker image to use
    /*const dockerImage = useMock
        ? "jarnohendriksen/mockseco:v1"
       // :"searchseco/controller";
        : "searchseco/controller:master";*/

        const dockerImage = 
       "searchseco/controller:master";
   // "searchseco/controller:master";

    // The mock can't handle a custom entrypoint, while SearchSECO requires it
    /*const entrypoint = useMock
        ? ""
        : '--entrypoint="./controller/build/searchseco"';
*/
        const entrypoint = "./controller/build/searchseco";

    // The token will be retrieved from the git data collection object once that is merged
    const ghToken = ghInfo.GithubToken;

    const cmd = "docker";
    const mockArgs = [
        "run",
        "--rm",
        "--name",
        "controller-container",
   // "searchseco-container",
        "-e",
        '"github_token=' + ghToken + '"',
        "-e",
        '"worker_name=test"',
        dockerImage,
        "check",
        gitrepo,
        "-V",
        "5"
    ];
    const realArgs = [
        "run",
        "--rm",
        "--name",
      "searchseco-container",
      "-e",
        '"github_token=' + ghToken + '"',
        "-e",
        '"worker_name=test"',
        dockerImage,
        "check",
        gitrepo,
    ];

    const args =  realArgs;

    // Output from the Docker container
    let stdout = "";

    try {
        if (!fs.existsSync("./ssOutputFiles")) fs.mkdirSync("./ssOutputFiles/");
        else
            LogMessage(
                "Directory ssOutputFiles already exists!",
                ErrorLevel.info
            );
    } catch {
        LogMessage("Could not create ssOutputFiles directory", ErrorLevel.err);
    }

    const stdOutStream = fs.createWriteStream("./ssOutputFiles/ssOutput.txt");
    const stdErrStream = fs.createWriteStream("./ssOutputFiles/ssError.txt");

    const options: ExecOptions = {
        ignoreReturnCode: true,
        windowsVerbatimArguments: true,
        outStream: stdOutStream,
        errStream: stdErrStream,
    };

    // SearchSECO prints its results in the console. The code below copies the
    // output to the variables stdout and stderr
    options.listeners = {
        stdout: (data: Buffer) => {
            stdout += data.toString();
        },
    };

    // Executes the Docker run command
    LogMessage("Starting Docker program: SearchSECO", ErrorLevel.info);
    if (useMock)
        LogMessage(
            "Running a mock of SearchSECO. The output will be incorrect!",
            ErrorLevel.warn
        );

    const exitCode = await exec(cmd, args, options);

    // Check Docker exit code
    throwError("SearchSECO", exitCode);

    // ParseInput expects an array of trimmed lines
    // (i.e. without trailing or leading whitespace)
    const lines = stdout.split("\n");
    const filteredlines = lines.filter((x) => x !== "");

    for (let n = 0; n < filteredlines.length; n++) {
        filteredlines[n] = filteredlines[n].trim();
    }

    const output: Output = parseOutput(filteredlines);

    return output;
}

/** A top-level object that contains a list of methods for which a match has been found. */
export interface Output {
    methods: Method[];
}

/** A method for which a match has been found. */
export interface Method {
    /** The hash of the abstract tree of this method, that was used to compare it with other methods in the database. */
    hash: String;

    /** An object containing the data associated with this method in this project. */
    data: MethodData;

    /** The list of matches. */
    matches: Match[];
}

/** An object containing the data associated with this method. */
export interface MethodData {
    /** The name of the method. */
    name: String;

    /** Only used in the matches, to indicate from which project the match originates. */
    project?: String;

    /** The path to the file in which the method was found. */
    file: String;

    /** The line on which the method starts in the file. */
    line: number;

    /** A list of authors associated with the project. */
    authors: String[];
}

/** An object containing data about a match. */
export interface Match {
    /** An object containing the data of the reused method. */
    data: MethodData;

    /** An object containing vulnerabilities detected by SearchSECO. */
    vuln: Vuln;
}

/** An object containing information about a vulnerability. */
export interface Vuln {
    /** The vulnerability code. */
    code: number;

    /** The url where information about this vulnerability can be found. */
    url: String;
}

/**
 * Parses the output of SearchSECO.
 *
 * @param input The string returned by SearchSECO, split on newlines. Each line is also trimmed to remove leading and trailing whitespace.
 * @returns The data parsed from the output of SearchSECO.
 */
export function parseOutput(input: String[]): Output {
    const hashIndices: number[] = getHashIndices(input);
    const ms: Method[] = [];

    for (let i = 0; i < hashIndices.length - 1; i++) {
        const h = input[hashIndices[i]].split(" ")[1];
        const d = getMethodInfo(input, hashIndices[i], hashIndices[i + 1]);
        const m = getMatches(input, hashIndices[i], hashIndices[i + 1]);
        ms.push({ hash: h, data: d, matches: m });
    }

    return { methods: ms };
}

/**
 * Gives the lines that contain a hash, and the total number of lines.
 * The array is used to indicate where data for a particular method begins and ends.
 *
 * @param input The string returned by SearchSECO, split on newlines. Each line is also trimmed to remove leading and trailing whitespace.
 * @returns An array containing the indices of lines that contain a hash.
 */
export function getHashIndices(input: String[]): number[] {
    const indices: number[] = [];

    for (let i = 1; i < input.length; i++) {
        // Check if the previous line consists of dashes to make sure an author named Hash isn't included
        if (
            input[i - 1].match(/(-)+/) !== null &&
            input[i].startsWith("Hash ")
        ) {
            indices.push(i);
        }
    }

    // Add last line + 1, to let the program know when to stop looping
    indices.push(input.length);

    return indices;
}

/**
 * Looks for the first line within a hash that contains `*Method`, and extracts
 * the data from the line. This only succeeds if the line has the structure:
 *
 * `*Method <methodName> in file <fileName> line <lineNumber>`
 *
 * @param input The string returned by SearchSECO, split on newlines. Each line is also trimmed to remove leading and trailing whitespace.
 * @param start The index of the first line that belongs to this method.
 * @param end The index of the first line that belongs to the next method (or that indicates the end of the input array).
 * @returns The data belonging to this method in this project.
 */
export function getMethodInfo(
    input: String[],
    start: number,
    end: number
): MethodData {
    const methodDataLine = getMatchIndicesOfHash(input, start, end);
    const words = input[methodDataLine[0]].split(" ").filter((x) => x);
    if (words.length < 7) throw new Error();
    const auth: String[] = [];

    // List of authors always starts two lines below the line with method data,
    // and ends before the line containing DATABASE
    let index = methodDataLine[0] + 2;
    if (input[index - 1].includes("Authors of local function:")) {
        while (index < end) {
            if (input[index] === "DATABASE") break;
            if (input[index] !== "") auth.push(input[index]);
            index++;
        }
    }

    const data: MethodData = {
        name: words[1],
        file: words[4],
        line: parseInt(words[6]),
        authors: auth,
    };
    return data;
}

/**
 * Retrieves the matches from the output of SearchSECO.
 *
 * @param input The string returned by SearchSECO, split on newlines. Each line is also trimmed to remove leading and trailing whitespace.
 * @param start The index of the first line that belongs to this method.
 * @param end The index of the first line that belongs to the next method (or that indicates the end of the input array).
 * @returns An array of matches containing data of the methods that were found in other projects.
 */
export function getMatches(
    input: String[],
    start: number,
    end: number
): Match[] {
    const matchList: Match[] = [];
    const methodDataLine = getMatchIndicesOfHash(input, start, end);
    for (let i = 1; i < methodDataLine.length; i++) {
        const words = input[methodDataLine[i]].split(" ");
        const auth: String[] = [];

        let v: Vuln;
        const vulnLineNumber = methodDataLine[i] + 2;
        let firstAuthorLine: number;
        if (vulnLineNumber < end) {
            if (
                !input[vulnLineNumber].includes("Method marked as vulnerable")
            ) {
                v = { code: -1, url: "-" };
                firstAuthorLine = methodDataLine[i] + 3;
            } else {
                const vulnLine = input[methodDataLine[i] + 2]
                    .split(" ")[6]
                    .split("(");
                const vCode = vulnLine[0];
                const vUrl = vulnLine[1].substring(0, vulnLine[1].length - 1);

                v = { code: parseInt(vCode), url: vUrl };
                firstAuthorLine = methodDataLine[i] + 4;
            }
        } else {
            v = { code: -1, url: "-" };
            firstAuthorLine = end;
        }

        // List of authors always starts two lines below the line
        // with method data, and ends before the next *Method or
        // the next Hash header (a string of dashes)
        let index = firstAuthorLine;
        if (index < end) {
            if (
                input[index - 1].includes(
                    "Authors of function found in database:"
                )
            ) {
                while (
                    index < end &&
                    input[index].search(/\*Method/) === -1 &&
                    input[index].search(/[-]+/) === -1
                ) {
                    if (input[index] !== "") auth.push(input[index]);
                    index++;
                }
            }
        }

        const d: MethodData = {
            name: words[1],
            file: words[7],
            project: words[4],
            line: parseInt(words[9]),
            authors: auth,
        };

        const match: Match = { data: d, vuln: v };

        matchList.push(match);
    }

    return matchList;
}

/**
 * Gives the lines within one method block that contain `*Method`.
 *
 * @param input The string returned by SearchSECO, split on newlines. Each line is also trimmed to remove leading and trailing whitespace.
 * @param start The index of the first line that belongs to this method.
 * @param end The index of the first line that belongs to the next method (or that indicates the end of the input array).
 * @returns An array containing the indices of lines containing `*Method`.
 */
export function getMatchIndicesOfHash(
    input: String[],
    start: number,
    end: number
): number[] {
    const indices: number[] = [];
    for (let i = start; i < end; i++) {
        if (input[i].startsWith("*Method")) indices.push(i);
    }

    return indices;
}
