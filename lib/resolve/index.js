const path = require("path");
const fs = require("fs-extra");
const Resolver = require("./generate");
const logger = require("../utils/logger");

async function resolve(filepath, args) {
    if (args.debug) {
        process.env.CLUAS_CLI_DEBUG = args.debug;
    }

    if (!path.isAbsolute(filepath)) {
        filepath = path.resolve(process.cwd(), filepath);
    }

    const resolver = new Resolver({
        filepath,
        args
    });

    await resolver.download();

    await resolver.create();
}

module.exports = (...args) => {
    return resolve(...args).catch(err => {
        logger.fatal(err);
        process.exit(1);
    });
};
