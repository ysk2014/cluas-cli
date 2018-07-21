
const fs = require("fs-extra");

function add(tplName, args) {

}

module.exports = (...args) => {
    return add(...args).catch(err => {
        console.log(err);
        process.exit(1);
    });
};
