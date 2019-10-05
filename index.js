#!/usr/bin/env node
const meow = require('meow');
const axios = require('axios');
const fsBase = require('fs');
const fs = fsBase.promises;
const path = require('path');
const filenamify = require('filenamify');
const jsdom = require('jsdom').JSDOM;
const ProgressBar = require('progress');

const cli = meow(`
    Usage
      $ yiff-dl <Creator ID or Yiff.party creator URL>

    Options
      --user-agent  Specifies a custom user agent.
      --output, -o  Specifies a custom output folder (default is a folder named 'yiff-dl-output' in the current working directory: ${process.cwd() + '/yiff-dl-output'}).

    Examples
      $ yiff-dl 3519586
      $ yiff-dl https://yiff.party/patreon/3519586
`,
{
    flags: {
        userAgent: {
            type: 'string',
            default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:68.0) Gecko/20100101 Firefox/68.0',
        },
        output: {
            type: 'string',
            alias: 'o',
            default: process.cwd() + '/yiff-dl-output',
        },
    },
});

if (cli.input.length === 0) {
    console.error('Please specify creator ID!');
    process.exit(1);
}

/**
 * Accept input that is either the creator ID, or the Yiff.party URL (which includes the creator ID).
 */
const removeYiffPrefix = /((http)?(s?)):\/\/yiff\.party(\/patreon)?\//g;
const creatorId = parseInt(cli.input[0].replace(removeYiffPrefix, ''), 10);

if (/^[\d]+$/.test(creatorId) === false) {
    console.error('Invalid creator ID specified. All creator ID are numerics (example: 3519586).');
    process.exit(1);
}

const client = axios.create({
    method: 'GET',
    headers: {
        'User-Agent': cli.flags.userAgent,
    },
});

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
    return dir
        .replace(/[^a-z0-9-]/gi, '_')
        // Avoid double (or more) underscores
        .replace(/_{2,}/g, '_');
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

        console.log(`Resolved & created directory: ${dir}`);
        return dir;
    }

    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
        console.error(`Path ${dir} exists, but is not a directory (most likely a file).`);
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
        console.log(`File already exists: ${output} -- Skipping`);
        return null;
    }

    const response = await client({
        url: url,
        responseType: 'stream',
    });

    const fileLength = parseInt(response.headers['content-length'], 10);
    const bar = new ProgressBar(`Downloading file: ${filename} - [:bar] :percent`, {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: fileLength,
    });

    response.data.pipe(fsBase.createWriteStream(output));

    return new Promise((resolve, reject) => {
        response.data.on('end', () => {
            resolve();
        });

        response.data.on('data', (data) => {
            bar.tick(data.length);
        });

        response.data.on('error', (err) => {
            console.error(`An error occurred downloading URL: ${url}`);
            console.error(`Could not save file: ${output}`);
            console.error(err);

            reject(err);
        });
    });
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
    }
    catch (err) {
        console.error(`Error writing file: ${output}`);
        console.error(err);

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
    const inlineImages = Array.from(dom.window.document.querySelectorAll('img'));

    const imageLinks = inlineImages.map((img) => {
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

(async () => {
    console.log('Retrieving and filtering through all creators from Yiff to get specific creator details...\n', 'This step might take a few seconds, please be patient...');
    const getAllCreators = await client('https://yiff.party/json/creators.json', {
        responseType: 'json',
    });

    /**
     * Get certain details about the creator, such as username.
     */
    const creators = getAllCreators.data.creators;
    const creatorDetails = creators.find((creator) => {
        return creator.id === creatorId;
    });

    console.log('Found creator details:');
    console.log(JSON.stringify(creatorDetails, null, 4));

    /**
     * Get specific posts and shared files related to creator.
     */
    console.log('Getting specific creator data from Yiff (posts, shared files etc.)');
    const getCreatorData = await client(`https://yiff.party/${creatorId}.json`, {
        responseType: 'json',
    });
    const { posts, shared_files } = getCreatorData.data;

    console.log(`Downloading started for creator: ${creatorDetails.name} (${creatorId})`);
    const outputBase = cli.flags.output;

    for (const postIndex in posts) {
        const post = posts[postIndex];

        /**
         * Extract the date the Patreon post was created.
         */
        const postCreated = new Date(post.created * 1000);
        const postDate = await formatDate(postCreated);

        let outputPath = `${outputBase}/${postDate}_${await normalizePath(post.title)}_${post.id}`;
        outputPath = await checkAndCreateDir(outputPath);

        if (outputPath === null) {
            console.error(`An error occurred verifying/creating directory: ${outputPath}`);
            continue;
        }

        /**
         * Save post body as HTML file.
         */
        const inlineRegex = new RegExp(`/patreon_inline/${post.id}/`, 'g');
        const postBody = post.body.replace(inlineRegex, './');
        const postBodyFile = await saveTextFile(outputPath, '_post_body.html', postBody);
        if (postBodyFile !== null) {
            console.log(`Shared file metadata has been saved to ${postBodyFile}`);
        }

        /**
         * Save inline media (images) from the post body.
         */
        const inlineImages = await parseInline(post.body);
        for (const imgIndex in inlineImages) {
            const imageUrl = inlineImages[imgIndex];
            const fileName = imageUrl.replace(/.*\//g, '');
            const inlineFile = await downloadFile(imageUrl, outputPath, fileName);

            if (inlineFile !== null) {
                console.log(`Downloaded inline (embedded) media file: ${fileName} for post titled: ${post.title} (${post.id})`);
            }
        }

        /**
         * Download Patreon post attachments
         */
        const attachments = post.attachments;
        for (const attachIndex in attachments) {
            const attachment = attachments[attachIndex];

            const fileName = attachment.file_name;
            const attachmentSave = await downloadFile(attachment.file_url, outputPath, fileName);

            if (attachmentSave !== null) {
                console.log(`Downloaded the attachment file: ${fileName} for post titled: ${post.title} (${post.id})`);
            }
        }

        /**
         * Download Patreon post file (usually the header or similar) if it exists.
         */
        const postFile = post.post_file;

        if (postFile.post_file) {
            const postFileSave = await downloadFile(postFile.file_url, outputPath, postFile.file_name);
            if (postFileSave !== null) {
                console.log(`Downloaded the post file: ${postFile.file_name} for post titled: ${post.title} (${post.id})`);
            }
        }
    }

    /**
     * Handle downloads of "shared files"
     */
    const outputPath = await checkAndCreateDir(`${outputBase}/_SharedFiles`);
    if (outputPath === null) {
        console.error(`An error occurred verifying/creating directory: ${outputPath}`);
    } else {
        for (const sharedIndex in shared_files) {
            const sharedFile = shared_files[sharedIndex];
            const { file_name, file_url, title, description, id } = sharedFile;

            const fileName = `${id}_${file_name}`;
            const metaText = `Title: ${title}\nDescription: ${description === null ? '<None>' : description}`;

            const sharedFileDownload = await downloadFile(file_url, outputPath, fileName);

            if (sharedFileDownload !== null) {
                console.log(`Downloaded the shared file: ${fileName} - Title: ${title}`);

                const metaFile = await saveTextFile(outputPath, `${fileName}.meta`, metaText);
                if (metaFile !== null) {
                    console.log(`Shared file metadata has been downloaded to ${metaFile}`);
                }
            }
        }
    }
})();
