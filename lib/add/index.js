const path = require("path");
const fs = require("fs-extra");
const home = require("user-home");
const rm = require("rimraf").sync;
const exists = require("fs").existsSync;
const download = require("download-git-repo");
const ora = require("ora");

let generate = require("./generate");
const logger = require("../utils/logger");

async function add(template, args) {
    if (args.debug) {
        process.env.CLUAS_CLI_DEBUG = args.debug;
    }

    const templatePath = path.join(
        home,
        ".cluas-templates",
        template.replace(/[\/:]/g, "-")
    ); // 模版存放路径
    const templateRoot = path.join(home, ".cluas-templates");
    const baseDir = path.resolve(process.cwd());

    // mkdir
    if (!exists(templateRoot)) {
        await fs.ensureDir(templateRoot);
    }

    await run(template, templatePath, baseDir);
}

async function run(template, templatePath, baseDir) {
    const spinner = ora("downloading template...");
    spinner.start();

    // 如果模版在本地已存储，则先删除
    if (exists(templatePath)) {
        rm(templatePath);
    }

    try {
        await downloadPromise(template, templatePath);
        spinner.stop();
        await generate(template, templatePath, baseDir);
    } catch (error) {
        console.log(error);
        logger.fatal(
            `Failed to download repo ${template} :  ${error.message.trim()}`
        );
    }
}

function downloadPromise(template, tmp) {
    const officialTemplate = "ysk2014/" + template;
    return new Promise((reslove, reject) => {
        download(officialTemplate, tmp, function(err) {
            if (err) return reject(err);
            return reslove(true);
        });
    });
}

module.exports = (...args) => {
    return add(...args).catch(err => {
        logger.fatal(err);
    });
};
