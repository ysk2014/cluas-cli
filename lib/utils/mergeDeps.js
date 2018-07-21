const semver = require("semver");

const logger = require("./logger");

module.exports = function mergeDeps(to, from) {
    let res = Object.assign({}, to);

    for (let name in from) {
        let r1 = to[name];
        let r2 = from[name];
        const isValidURI =
            r2.match(
                /^(?:file|git|git\+ssh|git\+http|git\+https|git\+file|https?):/
            ) != null;
        const isValidGitHub = r2.match(/^[^/]+\/[^/]+/) != null;

        if (r1 === r2) continue;

        if (!isValidGitHub && !isValidURI && !semver.validRange(r2)) {
            logger.warn(
                `invalid version range for dependency "${name}":\n\n` +
                    `- ${r2} injected by generator "${generatorId}"`
            );
            continue;
        }

        if (!r1) {
            res[name] = r2;
        } else {
            const r1semver = extractSemver(r1);
            const r2semver = extractSemver(r2);
            const r = tryGetNewerRange(r1semver, r2semver);
            const didGetNewer = !!r;
            // if failed to infer newer version, use existing one because it's likely
            // built-in
            res[name] = didGetNewer ? injectSemver(r2, r) : r1;
            // warn incompatible version requirements
            if (
                !semver.validRange(r1semver) ||
                !semver.validRange(r2semver) ||
                !semver.intersects(r1semver, r2semver)
            ) {
                logger.warn(
                    `conflicting versions for project dependency "${name}":\n\n` +
                        `Using ${didGetNewer ? "newer " : ""}version (${
                            res[name]
                        }), but this may cause build errors.`
                );
            }
        }
    }

    return res;
};

const leadRE = /^(~|\^|>=?)/;
const rangeToVersion = r => r.replace(leadRE, "").replace(/x/g, "0");
const extractSemver = r => r.replace(/^.+#semver:/, "");
const injectSemver = (r, v) =>
    semver.validRange(r) ? v : r.replace(/#semver:.+$/, `#semver:${v}`);

function tryGetNewerRange(r1, r2) {
    const v1 = rangeToVersion(r1);
    const v2 = rangeToVersion(r2);
    if (semver.valid(v1) && semver.valid(v2)) {
        return semver.gt(v1, v2) ? r1 : r2;
    }
}
