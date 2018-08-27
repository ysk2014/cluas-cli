const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");
const inquirer = require("inquirer");
const home = require("user-home");
const rm = require("rimraf").sync;
const exists = require("fs").existsSync;
const ora = require("ora");
const globby = require("globby");
const isBinary = require("isbinaryfile");
const ejs = require("ejs");

const db = require("../utils/db");
const downloadPromise = require("../utils/download");
let { loadModule } = require("../utils/module");
const normalizeFilePaths = require("../utils/normalizeFilePaths");
const writeFileTree = require("../utils/writeFileTree");
const logger = require("../utils/logger");

class Creator extends EventEmitter {
    constructor({ template, projectPath, mode }) {
        super();

        this.template = template;
        this.mode = mode;
        this.projectPath = projectPath; //项目目录

        this.files = {};
        this.fileMiddlewares = [];
    }

    async download(clear) {
        let template = this.template;
        this.templatePath = path.join(
            home,
            ".cluas",
            "project-templates",
            template.replace(/[\/:]/g, "-")
        ); // 模版存放路径

        try {
            let spinner = null;
            if (this.mode == "cmd") {
                spinner = ora("downloading template...");
                spinner.start();
            }
            this.emit("create:download:start");

            let isExist = exists(this.templatePath);

            if (clear) {
                db.get("prompts")
                    .remove({
                        cwd: this.projectPath,
                        id: this.templatePath
                    })
                    .write();
                // 如果模版在本地已存储，则先删除
                if (isExist) {
                    rm(this.templatePath);
                }

                await downloadPromise(template, this.templatePath);
            } else if (!isExist) {
                await downloadPromise(template, this.templatePath);
            }

            if (this.mode == "cmd") {
                spinner.stop();
            }
            //获取module的生成器
            this.meta = loadModule("meta", this.templatePath);

            if (!this.meta) {
                throw new Error(`${template} 项目模板中没有meta文件`);
            } else {
                this.emit("create:download:done", this.meta);
            }
        } catch (err) {
            this.emit("create:download:error", err);
            logger.fatal(err);
        }
    }

    async create(meta) {
        if (!this.meta) return false;

        this.emit("create:generator:start");

        try {
            let options = { meta: {}, filters: [] };
            if (!meta) {
                options = await this._resolveMeta();
            } else {
                options.meta = meta;
                if (this.meta.filters) {
                    Object.keys(this.meta.filters).forEach(key => {
                        let index = this.meta.filters[key];
                        if (!options.meta[index]) {
                            options.filters.push(key);
                        }
                    });
                }
            }

            this._render(options);
            await this._resolveFiles();
            await writeFileTree(this.files);

            this.emit("create:generator:done");
        } catch (error) {
            this.emit("create:generator:error", error);
            logger.fatal(error);
        }
    }

    async _resolveMeta() {
        let options = { meta: {}, filters: [] };
        if (!this.meta) return options;
        if (!this.meta.prompts) return options;

        let cacheData = db
            .get("prompts")
            .find({ cwd: this.projectPath, id: this.templatePath })
            .value();
        let needCaches = [],
            needObj = {},
            prompts = [];
        this.meta.prompts.forEach((p, i) => {
            if (cacheData && p.name in cacheData) {
                // console.log(p);
            } else {
                if (p.cache) {
                    needCaches.push(p.name);
                    delete p.cache;
                }
                prompts.push(p);
            }
        });

        if (prompts.length > 0) {
            options.meta = await inquirer.prompt(prompts);

            if (needCaches.length > 0) {
                needCaches.forEach(key => {
                    needObj[key] = options.meta[key];
                });

                if (cacheData) {
                    db.get("prompts")
                        .find({ cwd: this.projectPath, id: this.templatePath })
                        .assign(needObj)
                        .write();
                } else {
                    db.get("prompts")
                        .push(
                            Object.assign(
                                {
                                    id: this.templatePath,
                                    cwd: this.projectPath
                                },
                                needObj
                            )
                        )
                        .write();
                }
            }
        }

        options.meta = Object.assign(
            options.meta,
            db
                .get("prompts")
                .find({ cwd: this.projectPath, id: this.templatePath })
                .value()
        );

        if (this.meta.filters) {
            Object.keys(this.meta.filters).forEach(key => {
                let index = this.meta.filters[key];
                if (!options.meta[index]) {
                    options.filters.push(key);
                }
            });
        }

        return options;
    }

    _injectFileMiddleware(middleware) {
        this.fileMiddlewares.push(middleware);
    }

    _render(options) {
        let source = path.resolve(this.templatePath, "templates");
        if (!exists(source)) {
            throw new Error(`${this.template} 项目模板中没有templates文件夹`);
        }

        this._injectFileMiddleware(async files => {
            let data = options.meta;
            let _files = await globby(["**/*"], {
                cwd: source,
                ignore: options.filters
            });

            for (let rawPath of _files) {
                let filename = path.basename(rawPath);

                if (filename.charAt(0) === "_" && filename.charAt(1) !== "_") {
                    filename = `${filename.slice(1)}`;
                }

                if (filename.charAt(0) === "_" && filename.charAt(1) === "_") {
                    filename = `${filename.slice(1)}`;
                }

                const targetPath = path.join(path.dirname(rawPath), filename);
                const sourcePath = path.resolve(source, rawPath);
                const content = renderFile(sourcePath, data);

                if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
                    files[targetPath] = {
                        source: content,
                        dir: this.projectPath
                    };
                }
            }
        });
    }

    async _resolveFiles() {
        const files = this.files;
        for (let middleware of this.fileMiddlewares) {
            await middleware(files);
        }

        normalizeFilePaths(files);
    }
}

module.exports = Creator;

function renderFile(name, data, ejsOptions) {
    if (isBinary.sync(name)) {
        return fs.readFileSync(name); // return buffer
    }

    let source = fs.readFileSync(name, "utf-8");

    return ejs.render(source, data, ejsOptions);
}
