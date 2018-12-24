const fs = require("fs");
const recast = require("recast");

module.exports = filepath => {
    let comments = [];
    let code = fs.readFileSync(filepath, "utf-8");

    let ast = recast.parse(code, {
        parser: require("recast/parsers/babylon"),
        tokens: false
    });

    recast.types.visit(ast, {
        visitComment(path) {
            comments.push(path.value.value);
            this.traverse(path);
        }
    });

    return comments;
};
