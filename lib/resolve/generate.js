const fs = require("fs-extra");
const path = require("path");
const ejs = require("ejs");
const resolveComments = require("../utils/resolveComment");

class Resolver {
    constructor({ filepath, args }) {
        this.filepath = filepath;
        this.args = args;
    }

    resolve() {
        let comments = resolveComments(filepath);
        let data = this.filter(comments);
        this.createFiles(data);
    }

    /**
     *
     * @param {*} comments
     *
     * {createFile: "", param1: "", param2: ""}
     */
    filter(comments) {
        let res = [];
        if (!comments.length) return res;
        this.comments
            .filter(item => item.indexOf("@createFile") >= 0)
            .forEach(item => {
                let obj = {};
                item.split("\n").forEach(params => {
                    if (params.indexOf("@") < 0) return false;
                    let arr = params
                        .replace(/\*/g, "")
                        .replace(/['|"]/g, "")
                        .replace(/ /g, "")
                        .replace(/\t/g, "")
                        .split(":");

                    obj[arr[0].replace("@", "")] = arr[1];
                });

                res.push(obj);
            });

        return res;
    }

    render(data) {
        return Promise.all(
            data.map(obj => {
                obj["createFile"] = renderFile();
            })
        );
    }

    createFiles(data) {
        return Promise.all(
            data.map(async obj => {
                let filepath = path.resolve(path.dirname(this.filepath), obj["createFile"]);
                await fs.ensureDir(path.dirname(filepath));
                await fs.writeFile(filepath);
            })
        );
    }
}

module.exports = Resolver;

function renderFile(name, data, ejsOptions = {}) {
    let source = fs.readFileSync(name, "utf-8");
    return ejs.render(source, data, ejsOptions);
}
