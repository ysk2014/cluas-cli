const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");
const readPkg = require("read-pkg");
const inquirer = require("inquirer");

const AddAPI = require("./api");
let { loadModule } = require("../utils/module");
const normalizeFilePaths = require("../utils/normalizeFilePaths");
const injectImports = require("../utils/injectImports");
const writeFileTree = require("../utils/writeFileTree");
const sortObject = require("../utils/sortObject");
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
    constructor({ plugin, pkg, meta, baseDir, projectPath }) {
        super();

        this.plugin = plugin; //插件
        this.pkg = pkg;
        this.meta = meta;
        this.baseDir = baseDir; //模板根目录
        this.projectPath = projectPath; //项目目录
        this.options = {
            vue: false,
            vueRouter: false,
            vuex: false
        };
        this.files = {};
        this.fileMiddlewares = [];
        this.imports = {};
        this.injectVue = {};
        this.injectVueModule = {};
        this.injectVueRoutes = {};
        this.injectVueStore = {};
        this.injectApis = {};

        this.isPkgRender = false;
    }

    async create() {
        if (this.pkg) {
            this.checkPkg();
        }

        let options = { meta: {}, filters: [] };

        if (this.meta) {
            debug && logger.log("加载插件中的meta.json...");
            options.meta = await inquirer.prompt(this.meta.prompts);

            if (this.meta.filters) {
                Object.keys(this.meta.filters).forEach(key => {
                    let index = this.meta.filters[key];
                    if (options.meta[index]) {
                        options.filters.push(key);
                    }
                });
            }
        }

        const addApi = new AddAPI(this, options, this.options);
        this.plugin(addApi, options.meta, this.options);

        await this.resolveFiles();

        if (this.isPkgRender) {
            this.sortPkg();
            this.files["package.json"] = {
                source: JSON.stringify(this.pkg, null, 2),
                dir: this.projectPath
            };
        }

        await writeFileTree(this.files);
    }

    checkPkg() {
        let modules = Object.assign(
            {},
            this.pkg.dependencies,
            this.pkg.devDependencies
        );
        Object.keys(modules).forEach(name => {
            if (name == "vue") {
                this.options.vue = true;
            } else if (name == "vue-router") {
                this.options.vueRouter = true;
            } else if (name == "vuex") {
                this.options.vuex = true;
            }
        });
    }

    sortPkg() {
        this.pkg.dependencies = sortObject(this.pkg.dependencies);
        this.pkg.devDependencies = sortObject(this.pkg.devDependencies);
    }

    async resolveFiles() {
        const files = this.files;
        debug && logger.log("生成插件中template...");
        for (let middleware of this.fileMiddlewares) {
            await middleware(files);
        }

        normalizeFilePaths(files);


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

module.exports = async (template, templatePath, baseDir) => {
    debug = process.env.CLUAS_CLI_DEBUG;

    //获取module的生成器
    debug && logger.log(`加载${template}中的generator...`);
    let plugin = loadModule("generator", templatePath);
    if (!plugin) {
        return logger.fatal(
            "the module of \"%s\" has not generator.js.",
            template
        );
    }

    let pkg = {};
    if (fs.existsSync(path.resolve(baseDir, "package.json"))) {
        pkg = readPkg.sync({
            cwd: baseDir
        });
        debug && logger.log(`加载${template}中的package.json...`);
    }

    let meta = loadModule("meta", templatePath);

    const addor = new Addor({
        plugin,
        pkg,
        meta,
        baseDir: templatePath,
        projectPath: baseDir
    });

    await addor.create();

    logger.success("√ generated model \"%s\" success.", template);
};
