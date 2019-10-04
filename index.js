const meow = require('meow');
const axios = require('axios');
const fsBase = require('fs');
const fs = fsBase.promises;
const path = require('path');
const filenamify = require('filenamify');

const cli = meow(`
    Usage
      $ yiff-dl <Creator ID or Yiff.party creator URL>

    Options
      --user-agent  Specifies a custom user agent.
      --output, -o  Specifies a custom output folder (default is a folder named 'output' in the current working directory: ${process.cwd() + '/output'}).

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
            default: process.cwd() + '/output',
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
        .replace(/[^a-z0-9]/gi, '_')
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

    response.data.pipe(fsBase.createWriteStream(output));

    return new Promise((resolve, reject) => {
        response.data.on('end', () => {
            resolve();
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
 * Matches inline URLs in body.
 */
async function matchInline(body, postId) {
    const exp = new RegExp(`src="(/patreon_inline/${postId}/[\\w-_]+\\.[A-z0-9]{2,6})"`, 'g');

    return body.match(exp);
}

(async () => {
    console.log('Retrieving and filtering through all creators from Yiff to get specific creator details...', 'This step might take a few seconds, please be patient...');
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
     * TODO:
     * - Parse post bodies and make sure that `patreon_inline` URLs are downloaded
     *      - Good starting point: `src="(\/patreon_inline\/${postId}\/[\w-_]+\.[A-z0-9]{2,6})"`
     * - Download `shared_files`
     */
    console.log(getCreatorData.data);
})();
