const download = require("download-git-repo");

function downloadPromise(template, tmp) {
    const officialTemplate = "ysk2014/" + template;
    return new Promise((reslove, reject) => {
        download(officialTemplate, tmp, function(err) {
            if (err) return reject(err);
            return reslove(true);
        });
    });
}

module.exports = downloadPromise;
