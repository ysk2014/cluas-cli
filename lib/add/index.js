const path = require("path");
const fs = require("fs-extra");
const home = require("user-home");
const exists = require("fs").existsSync;
let Addor = require("./generate");
const logger = require("../utils/logger");

async function add(template, args) {
    if (args.debug) {
        process.env.CLUAS_CLI_DEBUG = args.debug;
    }

    const templateRoot = path.join(home, ".cluas/templates");
    const baseDir = path.resolve(process.cwd());

    // mkdir
    if (!exists(templateRoot)) {
        await fs.ensureDir(templateRoot);
    }

    const addor = new Addor({
        template: template,
        projectPath: baseDir,
        mode: "cmd"
    });

    await addor.download(args.clear);

    await addor.create();
}

module.exports = (...args) => {
    return add(...args).catch(err => {
        logger.fatal(err);
        process.exit(1);
    });
};
