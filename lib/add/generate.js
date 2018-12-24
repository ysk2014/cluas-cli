const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");
const readPkg = require("read-pkg");
const inquirer = require("inquirer");
const home = require("user-home");
const rm = require("rimraf").sync;
const exists = require("fs").existsSync;
const ora = require("ora");

const AddAPI = require("./api");
const downloadPromise = require("../utils/download");
let { loadModule } = require("../utils/module");
const injectImports = require("../utils/injectImports");
const sortObject = require("../utils/sortObject");
const db = require("../utils/db");
let {
    injectVue,
    injectVueModule,
    injectVueRoutes,
    injectVueStore,
    injectApis
} = require("../utils/injectVue");

const logger = require("../utils/logger");

let debug;

class Addor extends EventEmitter {
    /**
     * 初始化配置
     * @param {String} template 模板名称
     * @param {String} projectPath 项目根目录
     * @param {String} mode 调用模式，cmd：命令行调用，api: API调用
     * @param {Object} args 命令行参数
     */
    constructor({ template, projectPath, mode, args }) {
        super();

        this.template = template;
        this.mode = mode;
        this.cmdArgs = args;

        this.projectPath = projectPath; //项目目录
        // 判断是否符合vue、vueRouter、vuex的需求
        this.options = {
            vue: false,
            vueRouter: false,
            vuex: false
        };
        this.imports = {};
        this.injectVue = {};
        this.injectVueModule = {};
        this.injectVueRoutes = {};
        this.injectVueStore = {};
        this.injectApis = {};

        this.isPkgRender = false;

        this.checkPkg();
    }

    /**
     * 下载远程模板到缓存文件夹
     * @param {Boolean} clear 是否重新下载
     */
    async download() {
        let template = this.template;
        this.templatePath = path.join(home, ".cluas", "templates", template.replace(/[\/:]/g, "-")); // 模版存放路径

        const { clear } = this.cmdArgs;
        try {
            let spinner = null;
            // cmd模式显示加载动画
            if (this.mode == "cmd") {
                spinner = ora("downloading template...");
                spinner.start();
            }
            this.emit("add:download:start");

            // 删除所有缓存
            if (clear) {
                db.get("prompts")
                    .remove({ cwd: this.projectPath, id: this.templatePath })
                    .write();
                // 如果模版在本地已存储，则先删除
                if (exists(this.templatePath)) {
                    rm(this.templatePath);
                }

                await downloadPromise(template, this.templatePath);
            }

            if (this.mode == "cmd") {
                spinner.stop();
            }
            //获取module的生成器
            this.plugin = loadModule("generator", this.templatePath);
            this.meta = loadModule("meta", this.templatePath);

            // 对模板项目mata和generator文件的检查
            if (!this.meta || !this.plugin) {
                throw new Error(`${template} 模板插件中没有generator或者meta文件`);
            } else {
                this.emit("add:download:done", this.meta);
            }
        } catch (err) {
            this.emit("add:download:error", err);
            logger.fatal(err);
        }
    }

    /**
     * 生成文件
     * @param {Object} meta meta数据
     */
    async create(meta) {
        if (!this.plugin || !this.meta) {
            return false;
        }

        this.emit("add:generator:start");

        try {
            let options = { meta: {}, filters: [] };
            if (!meta) {
                options = await this.resolveMeta();
            } else {
                options.meta = meta;
                options = handleMetaFilters(this.meta.filters, options);
            }

            const addApi = new AddAPI(this, options, this.options);
            this.plugin(addApi, options.meta, this.options);
            await this.resolveFiles(addApi);

            if (this.isPkgRender) {
                this.sortPkg();
                addApi.files["package.json"] = {
                    source: JSON.stringify(this.pkg, null, 2),
                    dir: this.projectPath
                };
            }

            await addApi.writeFileTree();

            this.emit("add:generator:done");
        } catch (error) {
            this.emit("add:generator:error", error);
            logger.fatal(error);
        }
    }
    /**
     * 检测package.json文件，判断vue，vueRouter，vuex是否符合条件
     */
    checkPkg() {
        if (!fs.existsSync(path.resolve(this.projectPath, "package.json"))) return false;

        this.pkg = readPkg.sync({
            cwd: this.projectPath
        });

        let modules = Object.assign({}, this.pkg.dependencies, this.pkg.devDependencies);
        Object.keys(modules).forEach(name => {
            if (name == "vue") {
                this.options.vue = true;
            } else if (name == "vue-router") {
                let routerIndexPath = path.resolve(this.projectPath, "./src/router/index.js");
                let routerPath = path.resolve(this.projectPath, "./src/router.js");
                if (fs.existsSync(routerIndexPath)) {
                    this.options.vueRouter = routerIndexPath;
                } else if (fs.existsSync(routerPath)) {
                    this.options.vueRouter = routerPath;
                } else {
                    this.options.vueRouter = false;
                }
            } else if (name == "vuex") {
                let storeIndexPath = path.resolve(this.projectPath, "./src/store/index.js");
                let storePath = path.resolve(this.projectPath, "./src/store.js");
                if (fs.existsSync(storeIndexPath)) {
                    this.options.vuex = storeIndexPath;
                } else if (fs.existsSync(storePath)) {
                    this.options.vuex = storePath;
                } else {
                    this.options.vuex = false;
                }
            }
        });
    }

    /**
     * 对package进行排序
     */
    sortPkg() {
        this.pkg.dependencies = sortObject(this.pkg.dependencies);
        this.pkg.devDependencies = sortObject(this.pkg.devDependencies);
    }

    /**
     * 读取meta数据，并进行格式化
     * @description
     * 数据格式为
     * {
     *      prompts: [
     *          {
     *              name: "name",
     *              type: "input",
     *              message: "项目名称"
     *          }
     *      ],
     *      filters: {
     *          "src/router/**": "router"
     *      }
     * }
     */
    async resolveMeta() {
        let options = { meta: {}, filters: [] };

        if (!this.meta) return options;

        debug && logger.log("加载插件中的meta.json...");

        if (!this.meta.prompts) return options;

        // 读取缓存数据
        let cacheData = db
            .get("prompts")
            .find({ cwd: this.projectPath, id: this.baseDir })
            .value();

        let needCaches = [], // 需要缓存的数据
            needObj = {},
            prompts = []; // 不读缓存的数据

        // 提取不读缓存的数据和需要缓存的数据
        this.meta.prompts.forEach((p, i) => {
            if (!(cacheData && p.name in cacheData)) {
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
                        .find({ cwd: this.projectPath, id: this.baseDir })
                        .assign(needObj)
                        .write();
                } else {
                    db.get("prompts")
                        .push(
                            Object.assign(
                                {
                                    id: this.baseDir,
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
                .find({ cwd: this.projectPath, id: this.baseDir })
                .value()
        );

        options = handleMetaFilters(this.meta.filters, options);

        return options;
    }

    /**
     * 解析模板并创建文件
     */
    async resolveFiles(addApi) {
        const files = addApi.files;

        await addApi.resolveFileMiddlewares();

        //处理js文件
        Array.from(this.imports).forEach(file => {
            files[file] = {
                source: injectImports(file, {
                    cwd: this.projectPath,
                    js: this.imports[file]
                }),
                dir: this.projectPath
            };
        });
        //处理vue文件
        Array.from(this.injectVue).forEach(file => {
            files[file] = {
                source: injectVue(
                    file,
                    Object.assign(
                        {
                            cwd: this.projectPath
                        },
                        this.injectVue[file]
                    )
                ),
                dir: this.projectPath
            };
        });

        //处理vue中的module文件
        Object.keys(this.injectVueModule).forEach(file => {
            files[file] = {
                source: injectVueModule(file, {
                    cwd: this.projectPath,
                    js: this.injectVueModule[file]
                }),
                dir: this.projectPath
            };
        });

        //处理vue中route文件
        Object.keys(this.injectVueRoutes).forEach(file => {
            files[file] = {
                source: injectVueRoutes(file, {
                    cwd: this.projectPath,
                    js: this.injectVueRoutes[file]
                }),
                dir: this.projectPath
            };
        });

        //处理vue中store文件
        Object.keys(this.injectVueStore).forEach(file => {
            files[file] = {
                source: injectVueStore(file, {
                    cwd: this.projectPath,
                    js: this.injectVueStore[file]
                }),
                dir: this.projectPath
            };
        });

        //处理api文件
        Object.keys(this.injectApis).forEach(file => {
            files[file] = {
                source: injectApis(file, {
                    cwd: this.projectPath,
                    js: this.injectApis[file]
                }),
                dir: this.projectPath
            };
        });
    }
}

module.exports = Addor;

/**
 * 提取需要过滤的文件
 * @param {Array} filters
 * @param {Object} options
 */
function handleMetaFilters(filters, options) {
    if (!filters) return options;

    Object.keys(filters).forEach(key => {
        let index = filters[key];
        if (!options.meta[index]) {
            options.filters.push(key);
        }
    });
    return options;
}
