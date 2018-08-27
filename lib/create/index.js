const path = require("path");
const fs = require("fs-extra");
const home = require("user-home");
const exists = require("fs").existsSync;

const logger = require("../utils/logger");
const Creator = require("./Creator");

module.exports = (...args) => {
    return create(...args).catch(err => {
        logger.fatal(err);
        process.exit(1);
    });
};

async function create(tpl, baseDir, args) {
    const templateRoot = path.join(home, ".cluas/project-templates");

    // mkdir
    if (!exists(templateRoot)) {
        await fs.ensureDir(templateRoot);
    }

    const creator = new Creator({
        template: tpl,
        projectPath: baseDir,
        mode: "cmd"
    });

    await creator.download(args.clear);

    await creator.create();
}
