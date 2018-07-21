#!/usr/bin/env node

const chalk = require("chalk");
const semver = require("semver");
const requiredVersion = require("../package.json").engines.node;

function checkNodeVersion(wanted, id) {
    if (!semver.satisfies(process.version, wanted)) {
        console.log(
            chalk.red(
                "You are using Node " +
                    process.version +
                    ", but this version of " +
                    id +
                    "requires Node " +
                    wanted +
                    ".\nPlease upgrade your Node version."
            )
        );
        process.exit(1);
    }
}

checkNodeVersion(requiredVersion, "cluas-cli");

const program = require("commander");

program.version(require("../package").version).usage("<command> [options]");

program
    .command("add <tpl-name>")
    .description("添加模板")
    .option("-d, --debug", "debug模式下运行")
    .action((name, cmd) => {
        require("../lib/add/index")(name, cleanArgs(cmd));
    });

program.arguments("<command>").action(cmd => {
    program.outputHelp();
    console.log("  " + chalk.red(`Unknown command ${chalk.yellow(cmd)}.`));
    console.log();
});

// add some useful info on help
program.on("--help", () => {
    console.log();
    console.log(
        `  Run ${chalk.cyan(
            "cluas <command> --help"
        )} for detailed usage of given command.`
    );
    console.log();
});

program.commands.forEach(c => c.on("--help", () => console.log()));

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}

// commander passes the Command object itself as options,
// extract only actual options into a fresh object.
function cleanArgs(cmd) {
    const args = {};
    cmd.options.forEach(o => {
        const key = o.long.replace(/^--/, "");
        // if an option is not present and Command has a method with the same name
        // it should not be copied
        if (typeof cmd[key] !== "function") {
            args[key] = cmd[key];
        }
    });
    return args;
}
