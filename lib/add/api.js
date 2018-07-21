const path = require("path");
const fs = require("fs");
const merge = require("deepmerge");
const globby = require("globby");
const isBinary = require("isbinaryfile");
const ejs = require("ejs");
const mergeDeps = require("../utils/mergeDeps");
const logger = require("../utils/logger");

const isString = val => typeof val === "string";
const isFunction = val => typeof val === "function";
const isObject = val => val && typeof val === "object";

class AddAPI {
    constructor(addor, options, rootOptions) {
        this.addor = addor;
        this.options = options;
        this.rootOptions = rootOptions;
    }

    _resolveData(additionalData) {
        return Object.assign(
            {
                meta: this.options.meta,
                rootOptions: this.rootOptions
            },
            additionalData
        );
    }

    _injectFileMiddleware(middleware) {
        this.addor.fileMiddlewares.push(middleware);
    }

    /**
     * 渲染模板
     */
    render(source, dist, additionalData = {}, ejsOptions) {
        if (!dist) {
            logger.fatal("render has not dist params");
        }

        const baseDir = extractCallDir();
        if (isString(source)) {
            source = path.resolve(baseDir, source);
            this._injectFileMiddleware(async files => {
                let data = this._resolveData(additionalData);
                let _files = await globby(["**/*"], {
                    cwd: source,
                    ignore: this.options.filters
                });

                for (let rawPath of _files) {
                    let filename = path.basename(rawPath);

                    if (
                        filename.charAt(0) === "_" &&
                        filename.charAt(1) !== "_"
                    ) {
                        filename = `.${filename.slice(1)}`;
                    }
                    if (
                        filename.charAt(0) === "_" &&
                        filename.charAt(1) === "_"
                    ) {
                        filename = `${filename.slice(1)}`;
                    }

                    const targetPath = path.join(
                        path.dirname(rawPath),
                        filename
                    );
                    const sourcePath = path.resolve(source, rawPath);
                    const content = renderFile(sourcePath, data, ejsOptions);

                    if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
                        files[targetPath] = {
                            source: content,
                            dir: dist
                        };
                    }
                }
            });
        } else if (isObject(source)) {
            this._injectFileMiddleware(files => {
                const data = this._resolveData(additionalData);
                for (const targetPath in source) {
                    const sourcePath = path.resolve(
                        baseDir,
                        source[targetPath]
                    );
                    const content = renderFile(sourcePath, data, ejsOptions);
                    if (Buffer.isBuffer(content) || content.trim()) {
                        files[targetPath] = {
                            source: content,
                            dir: dist
                        };
                    }
                }
            });
        } else if (isFunction(source)) {
            this._injectFileMiddleware(source);
        }
    }

    renderToString(file, data, ejsOptions) {
        return renderFile(file, data, ejsOptions);
    }

    /**
     * 合并pkg
     */
    extendPackage(fields) {
        const pkg = this.addor.pkg;

        const toMerge = isFunction(fields) ? fields(pkg) : fields;

        for (let key in toMerge) {
            let value = toMerge[key];
            let existing = pkg[key];
            if (
                isObject(value) &&
                (key === "dependencies" || key === "devDependencies")
            ) {
                pkg[key] = mergeDeps(existing || {}, value);
            } else if (!(key in pkg)) {
                pkg[key] = value;
            } else if (Array.isArray(value) && Array.isArray(existing)) {
                pkg[key] = existing.concat(value);
            } else if (isObject(value) && isObject(existing)) {
                pkg[key] = merge(existing, value);
            } else {
                pkg[key] = value;
            }
        }

        this.addor.isPkgRender = true;
    }

    /**
     * 文件注入import
     */
    injectImports(file, imports) {
        let _imports =
            this.addor.imports[file] || (this.addor.imports[file] = new Set());
        (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
            _imports.add(imp);
        });
    }

    /**
     * vue文件注入
     * @param {*} file
     * @param {*} options
     */
    injectVue(file, options = {}) {
        let _imports =
            this.addor.injectVue[file] ||
            (this.addor.injectVue[file] = {
                js: new Set(),
                template: new Set()
            });

        if (options.js) {
            (Array.isArray(options.js) ? options.js : [options.js]).forEach(
                imp => {
                    _imports.js.add(imp);
                }
            );
        }
        if (options.template) {
            (Array.isArray(options.template)
                ? options.template
                : [options.template]
            ).forEach(imp => {
                _imports.template.add(imp);
            });
        }
    }

    /**
     * vue的module文件注入
     * @param {*} file
     * @param {*} imports
     */
    injectVueModule(file, imports) {
        let _imports =
            this.addor.injectVueModule[file] ||
            (this.addor.injectVueModule[file] = new Set());
        (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
            _imports.add(imp);
        });
    }

    /**
     * vue的路由文件注入
     * @param {*} file
     * @param {*} imports
     */
    injectVueRoutes(file, imports) {
        let _imports =
            this.addor.injectVueRoutes[file] ||
            (this.addor.injectVueRoutes[file] = new Set());
        (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
            _imports.add(imp);
        });
    }

    /**
     * vue的store文件注入
     * @param {*} file
     * @param {*} imports
     */
    injectVueStore(file, imports) {
        let _imports =
            this.addor.injectVueStore[file] ||
            (this.addor.injectVueStore[file] = new Set());
        (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
            _imports.add(imp);
        });
    }

    /**
     * api文件注入
     * @param {*} file
     * @param {*} imports
     */
    injectApis(file, imports) {
        let _imports =
            this.addor.injectApis[file] ||
            (this.addor.injectApis[file] = new Set());
        (Array.isArray(imports) ? imports : [imports]).forEach(imp => {
            _imports.add(imp);
        });
    }
}

function extractCallDir() {
    // extract api.render() callsite file location using error stack
    const obj = {};
    Error.captureStackTrace(obj);
    const callSite = obj.stack.split("\n")[3];
    const fileName = callSite.match(/\s\((.*):\d+:\d+\)$/)[1];
    return path.dirname(fileName);
}

function renderFile(name, data, ejsOptions) {
    if (isBinary.sync(name)) {
        return fs.readFileSync(name); // return buffer
    }

    let source = fs.readFileSync(name, "utf-8");

    return ejs.render(source, data, ejsOptions);
}

module.exports = AddAPI;
