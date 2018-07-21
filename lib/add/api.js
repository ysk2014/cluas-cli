const path = require("path");

const isString = val => typeof val === "string";
const isFunction = val => typeof val === "function";
const isObject = val => val && typeof val === "object";

class AddApi {
    constructor() {}
}

function extractCallDir() {
    // extract api.render() callsite file location using error stack
    const obj = {};
    Error.captureStackTrace(obj);
    const callSite = obj.stack.split("\n")[3];
    const fileName = callSite.match(/\s\((.*):\d+:\d+\)$/)[1];
    return path.dirname(fileName);
}
