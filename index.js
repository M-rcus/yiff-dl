#!/usr/bin/env node
const meow = require('meow');
const htmlparser = require('node-html-parser');
const signale = require('signale');
const path = require('path');

/**
 * Configure signale logger with custom settings
 */
signale.config({
    displayDate: true,
    displayTimestamp: true,
});

const cli = meow(
    `
    Usage
      $ yiff-dl <Creator ID or Yiff.party creator URL>

    Options
      --user-agent  Specifies a custom user agent.
      --output, -o  Specifies a custom output folder (default is a folder named 'yiff-dl-output' in the current working directory: ${process.cwd() + '/yiff-dl-output'}).
      --subfolder, -s   If specified, a subfolder with the creator name is created in the output directory. Example: ${process.cwd() + '/yiff-dl-output/megturney'}

    Examples
      $ yiff-dl 3519586
      $ yiff-dl https://yiff.party/patreon/3519586
`,
    {
        flags: {
            userAgent: {
                type: 'string',
                default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
            },
            output: {
                type: 'string',
                alias: 'o',
                default: process.cwd() + '/yiff-dl-output',
            },
            subfolder: {
                type: 'boolean',
                alias: 's',
                default: false,
            },
        },
    }
);

if (cli.input.length === 0) {
    signale.error('Please specify creator ID!');
    process.exit(1);
}

const _ = require('./helpers')(cli);

/**
 * Accept input that is either the creator ID, or the Yiff.party URL (which includes the creator ID).
 */
const removeYiffPrefix = /((http)?(s?)):\/\/yiff\.party(\/patreon)?\//g;
const creatorInput = cli.input[0]
    .trim()
    .replace(removeYiffPrefix, '');

/**
 * Assume it's a creator ID (not Patreon name)
 */
let isCreatorId = true;

/**
 * Check if it matches the creator ID format.
 * If it doesn't, treat it as Patreon name
 */
if (/^[\d]+$/.test(creatorInput) === false) {
    signale.info(`Input (${creatorInput}) does not match creator ID format. Assuming it's the Patreon name.`);
    isCreatorId = false;
}

/**
 * Yiff's JSON data treats creator IDs as ints,
 * so we need to convert our creator ID too.
 */
let creatorId = null;
if (isCreatorId) {
    creatorId = parseInt(creatorInput, 10);
}

/**
 * Set a maximum length for names
 * Certain Patreon post titles are extremely long, so let's cut them a bit.
 *
 * 60 characters is a somewhat sane character length,
 * since it should preserve most of the context (if any).
 */
const maxNameLength = 60;

(async () => {
    signale.info('Retrieving and filtering through all creators from Yiff to get specific creator details...');
    signale.info('This step might take a few seconds, please be patient...');
    const getAllCreators = await _.client('https://yiff.party/json/creators.json', {
        responseType: 'json',
    });

    /**
     * Get certain details about the creator, such as username.
     */
    const creators = getAllCreators.data.creators;
    const creatorDetails = creators.find((creator) => {
        /**
         * Creator IDs are matched directly.
         */
        if (isCreatorId) {
            return creator.id === creatorId;
        }

        /**
         * Creator names need to be in the same case before we can compare them.
         */
        const creatorName = creator.name
            .toLowerCase()
            .trim();

        return creatorName === creatorInput.toLowerCase();
    });

    if (!creatorDetails) {
        signale.info(`Could not find creator on Yiff: ${creatorInput}`);
        return null;
    }

    /**
     * If creatorId wasn't specified, we need to manually
     * set it based on data from Yiff.
     */
    if (!creatorId) {
        creatorId = creatorDetails.id;
    }

    signale.success('Found creator details:');
    console.log(JSON.stringify(creatorDetails, null, 4));

    /**
     * Get specific posts and shared files related to creator.
     */
    signale.info('Getting specific creator data from Yiff (posts, shared files etc.)');
    const getCreatorData = await _.client(`https://yiff.party/${creatorId}.json`, {
        responseType: 'json',
    });
    const { posts, shared_files } = getCreatorData.data;

    const getCreatorPage = await _.client(`https://yiff.party/patreon/${creatorId}`, {
        responseType: 'document',
    });

    const parsedPage = htmlparser.parse(getCreatorPage.data);

    signale.info(`Downloading started for creator: ${creatorDetails.name} (${creatorId})`);
    /**
     * Specifies the base folder for output
     */
    const {output, subfolder} = cli.flags;
    const outputBase = path.normalize(
        output +
        (subfolder ? `/${creatorDetails.name}` : '')
    );

    /**
     * Tell user what the final output base directory will be
     */
    if (subfolder) {
        signale.info(`Subfolder flag specified. Final output directory is: ${outputBase}`);
    }

    for (const post of posts) {
        /**
         * Extract the date the Patreon post was created.
         */
        const postCreated = new Date(post.created * 1000);
        const postDate = await _.formatDate(postCreated);
        let title = post.title;

        if (title.length > maxNameLength) {
            title = title.substring(0, maxNameLength - 1);
        }

        let outputPath = `${outputBase}/${postDate}_${await _.normalizePath(title)}_${post.id}`;
        outputPath = await _.checkAndCreateDir(outputPath);

        if (outputPath === null) {
            signale.error(`An error occurred verifying/creating directory: ${outputPath}`);
            continue;
        }

        /**
         * Save post body as HTML file.
         * Sometimes `post.body` might not exist (empty)
         */
        if (post.body) {
            const inlineRegex = new RegExp(`/patreon_inline/${post.id}/`, 'g');
            const postBody = post.body.replace(inlineRegex, './');
            const postBodyFile = await _.saveTextFile(outputPath, '_post_body.html', postBody);
            if (postBodyFile !== null) {
                signale.success(`Shared file metadata has been saved to ${postBodyFile}`);
            }
        }

        const postMedia = parsedPage.querySelector(`#p${post.id} .card-attachments`);
        if (postMedia) {
            const title = postMedia.querySelector('.card-title');
            const textTitle = title ? title.toString() : '';

            if (textTitle.includes('Media')) {
                const links = postMedia.querySelectorAll('a');

                for (const link of links) {
                    const linkUrl = link.attributes.href;
                    const filename = link.innerHTML;

                    if (!linkUrl) {
                        continue;
                    }

                    const mediaAttachment = await _.downloadFile(linkUrl, outputPath, filename);
                    if (mediaAttachment !== null) {
                        signale.success(`Downloaded 'Media' attachment: ${filename} for post titled: ${post.title} (${post.id})`);
                    }
                }
            }
        }

        /**
         * Save inline media (images) from the post body.
         */
        const inlineImages = await _.parseInline(post.body);
        for (const imageUrl of inlineImages) {
            const fileName = imageUrl.replace(/.*\//g, '');
            const inlineFile = await _.downloadFile(imageUrl, outputPath, fileName);

            if (inlineFile !== null) {
                signale.success(`Downloaded inline (embedded) media file: ${fileName} for post titled: ${post.title} (${post.id})`);
            }
        }

        /**
         * Download Patreon post attachments
         */
        const attachments = post.attachments;
        for (const attachment of attachments) {
            const fileName = attachment.file_name;
            const attachmentSave = await _.downloadFile(attachment.file_url, outputPath, fileName);

            if (attachmentSave !== null) {
                signale.success(`Downloaded the attachment file: ${fileName} for post titled: ${post.title} (${post.id})`);
            }
        }

        /**
         * Download Patreon post file (usually the header or similar) if it exists.
         */
        const postFile = post.post_file;

        if (postFile.post_file) {
            const postFileSave = await _.downloadFile(postFile.file_url, outputPath, postFile.file_name);
            if (postFileSave !== null) {
                signale.success(`Downloaded the post file: ${postFile.file_name} for post titled: ${post.title} (${post.id})`);
            }
        }
    }

    /**
     * Handle downloads of "shared files"
     */
    const outputPath = await _.checkAndCreateDir(`${outputBase}/_SharedFiles`);
    if (outputPath === null) {
        signale.error(`An error occurred verifying/creating directory: ${outputPath}`);
    } else {
        for (const sharedFile of shared_files) {
            const { file_name, file_url, title, description, id } = sharedFile;

            const fileName = `${id}_${file_name}`;
            const metaText = `Title: ${title}\nDescription: ${description === null ? '<None>' : description}`;

            const sharedFileDownload = await _.downloadFile(file_url, outputPath, fileName);

            if (sharedFileDownload !== null) {
                signale.success(`Downloaded the shared file: ${fileName} - Title: ${title}`);

                const metaFile = await _.saveTextFile(outputPath, `${fileName}.meta`, metaText);
                if (metaFile !== null) {
                    signale.success(`Shared file metadata has been downloaded to ${metaFile}`);
                }
            }
        }
    }
})();
