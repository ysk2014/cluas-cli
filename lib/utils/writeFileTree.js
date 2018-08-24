const fs = require("fs-extra");
const path = require("path");

function deleteRemovedFiles(newFiles, previousFiles) {
    // get all files that are not in the new filesystem and are still existing
    const filesToDelete = Object.keys(previousFiles).filter(
        filename => !newFiles[filename]
    );

    // delete each of these files
    return Promise.all(
        filesToDelete.map(filename => {
            return fs.unlink(path.join(filesToDelete[filename].dir, filename));
        })
    );
}

module.exports = async function writeFileTree(files, previousFiles) {
    if (previousFiles) {
        await deleteRemovedFiles(files, previousFiles);
    }
    return Promise.all(
        Object.keys(files).map(async name => {
            let filePath = path.resolve(process.cwd(), files[name].dir, name);
            if (path.isAbsolute(files[name].dir)) {
                filePath = path.resolve(files[name].dir, name);
            }
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, files[name].source);
        })
    );
};
