const axios = require('axios');
const fsBase = require('fs');
const fs = fsBase.promises;
const path = require('path');
const filenamify = require('filenamify');
const jsdom = require('jsdom').JSDOM;
const ProgressBar = require('progress');
const signale = require('signale');

let client = new axios.create();

async function formatDate(date) {
    let month = date.getMonth() + 1;
    let day = date.getDate();

    /**
     * Totally and definitely the best way to zero-prefix dates.
     */
    if (month < 10) {
        month = '0' + month;
    }

    if (day < 10) {
        day = '0' + day;
    }

    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Normalize path names and avoid 'special' characters.
 *
 * @param {String} dir
 */
async function normalizePath(dir) {
    return (
        dir
            .replace(/[^a-z0-9-]/gi, '_')
            // Avoid double (or more) underscores
            .replace(/_{2,}/g, '_')
    );
}

/**
 * Checks input path and makes sure it exists.
 * If it exists, it checks if it's a directory and errors if it doesn't.
 * If it doesn't exist, it will attempt to create it.
 *
 * @param {String} dir
 */
async function checkAndCreateDir(dir) {
    dir = path.normalize(dir);
    const exists = fsBase.existsSync(dir);

    if (!exists) {
        await fs.mkdir(dir, {
            recursive: true,
        });

        signale.info(`Resolved & created directory: ${dir}`);
        return dir;
    }

    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
        signale.error(
            `Path ${dir} exists, but is not a directory (most likely a file).`
        );
        return null;
    }

    return dir;
}

/**
 * Downloads a file as a blob from the specified URL, to the specified directory with the specified filename.
 *
 * @param {String} url
 * @param {String} path
 * @param {String} filename
 */
async function downloadFile(url, dir, filename) {
    filename = filenamify(filename);
    const output = `${dir}/${filename}`;

    if (fsBase.existsSync(output)) {
        signale.info(`File already exists: ${output} -- Skipping`);
        return null;
    }

    // Lazily catch errors
    try {
        const response = await client({
            url: url,
            responseType: 'stream',
        });

        const fileLength = parseInt(response.headers['content-length'], 10);
        const bar = new ProgressBar(
            `Downloading file: ${filename} - [:bar] :percent`,
            {
                complete: '=',
                incomplete: ' ',
                width: 20,
                total: fileLength,
            }
        );

        response.data.pipe(fsBase.createWriteStream(output));

        return new Promise((resolve, reject) => {
            response.data.on('end', () => {
                resolve();
            });

            response.data.on('data', data => {
                bar.tick(data.length);
            });

            response.data.on('error', err => {
                signale.error(`An error occurred downloading URL: ${url}`);
                signale.error(`Could not save file: ${output}`);
                signale.error(err);

                reject(err);
            });
        });
    } catch (err) {
        signale.error(`An error occurred downloading URL: ${url} -- Skipping`);
        signale.error(err);
        return null;
    }
}

/**
 * Saves a text file with UTF-8 encoding.
 *
 * @param {String} dir
 * @param {String} filename
 * @param {String} text
 */
async function saveTextFile(dir, filename, text) {
    filename = filenamify(filename);
    const output = `${dir}/${filename}`;

    try {
        await fs.writeFile(output, text, {
            encoding: 'utf8',
        });

        return output;
    } catch (err) {
        signale.error(`Error writing file: ${output}`);
        signale.error(err);

        return null;
    }
}

/**
 * Parses post the post body and extracts the inline images.
 *
 * @param {String} body
 */
async function parseInline(body) {
    const dom = new jsdom(body);
    const inlineImages = Array.from(
        dom.window.document.querySelectorAll('img')
    );

    const imageLinks = inlineImages.map(img => {
        const src = img.src;
        let prefix = 'https://yiff.party';
        // Only add a forward slash at the end of the prefix
        // if src doesn't already include it.
        // In most cases it should...
        if (src[0] !== '/') {
            prefix += '/';
        }

        return prefix + src;
    });

    return imageLinks;
}

/**
 * @param {Object} cli cli object from `meow`
 */
module.exports = (cli) => {
    client = axios.create({
        method: 'GET',
        headers: {
            'User-Agent': cli.flags.userAgent,
        },
    });

    return {
        checkAndCreateDir,
        client,
        downloadFile,
        formatDate,
        normalizePath,
        parseInline,
        saveTextFile,
    };
};
