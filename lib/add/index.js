const path = require("path");
const fs = require("fs-extra");
const home = require("user-home");
const exists = require("fs").existsSync;
const Addor = require("./generate");
const logger = require("../utils/logger");

async function add(template, args) {
    if (args.debug) {
        process.env.CLUAS_CLI_DEBUG = args.debug;
    }

    const templateRoot = path.join(home, ".cluas/templates");
    const baseDir = path.resolve(process.cwd());

    // 创建本地缓存文件夹
    if (!exists(templateRoot)) {
        await fs.ensureDir(templateRoot);
    }

    const addor = new Addor({
        template: template,
        projectPath: baseDir,
        mode: "cmd",
        args
    });

    await addor.download();

    await addor.create();
}

module.exports = (...args) => {
    return add(...args).catch(err => {
        logger.fatal(err);
        process.exit(1);
    });
};
