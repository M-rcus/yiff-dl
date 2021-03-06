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
                default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:73.0) Gecko/20100101 Firefox/73.0',
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
    const paginationCount = parsedPage.querySelector('.paginate-count');
    let maxPages = 1;

    /**
     * Keep track of all pages.
     *
     * Instead of zero-indexed array, let's make it an object
     * that uses the page number as the index.
     */
    const allPosts = {};
    const firstPagePosts = parsedPage.querySelectorAll('.yp-post');

    for (const post of firstPagePosts)
    {
        /**
         * Get ID and remove the first "p" used in the element ID.
         */
        const id = post.id.replace('p', '');
        allPosts[id] = post;
    }

    /**
     * Pagination count isn't available on
     * creator pages with less than 50 posts.
     */
    if (paginationCount) {
        const paginationText = paginationCount.innerHTML;
        const paginationSplit = paginationText.split(' / ');
        /**
         * Convert to an actual number
         */
        maxPages = parseInt(paginationSplit[1], 10);

        signale.info(`Found ${maxPages} pages for creator ${creatorInput}. Retrieving all pages.`);

        /**
         * Start retrieving pages from page 2 and beyond
         * since we already retrieved the first page.
         *
         * But let's just also display the message for the first page
         * to not confuse the user :)
         */
        signale.success(`Retrieved page #1/${maxPages} for creator: ${creatorInput}`);
        for (let i = 2; i < maxPages + 1; i++)
        {
            const getPage = await _.client(
                `https://yiff.party/patreon/${creatorId}?p=${i}`,
                {
                    responseType: 'document',
                }
            );

            signale.success(`Retrieved page #${i}/${maxPages} for creator: ${creatorInput}`);
            const page = htmlparser.parse(getPage.data);
            const posts = page.querySelectorAll('.yp-post');

            for (const post of posts) {
                /**
                 * Get ID and remove the first "p" used in the element ID.
                 */
                const id = post.id.replace('p', '');
                allPosts[id] = post;
            }
        }

        const totalPosts = (Object.keys(allPosts)).length;
        signale.success(`Retrieved and parsed a total of ${totalPosts} posts from Yiff`);
    }
    else {
        signale.info(`Creator ${creatorInput} seems to only have one page. Not retrieving any more pages.`);
    }

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

    /**
     * Display a timer for how long the total download took.
     */
    const downloadTimerName = `Yiff Download ${creatorDetails.name}`;
    signale.time(downloadTimerName);
    for (const post of posts) {
        /**
         * Extract the date the Patreon post was created.
         */
        const postCreated = new Date(post.created * 1000);
        const postDate = await _.formatDate(postCreated);
        const postId = post.id;
        let title = post.title;

        if (title.length > maxNameLength) {
            title = title.substring(0, maxNameLength - 1);
        }

        let outputPath = `${outputBase}/${postDate}_${await _.normalizePath(title)}_${postId}`;
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
            const inlineRegex = new RegExp(`/patreon_inline/${postId}/`, 'g');
            const postBody = post.body.replace(inlineRegex, './');
            const postBodyFile = await _.saveTextFile(outputPath, '_post_body.html', postBody);
            if (postBodyFile !== null) {
                signale.success(`Shared file metadata has been saved to ${postBodyFile}`);
            }
        }

        const parsedPost = allPosts[postId];

        /**
         * Hotfix for posts that can't be parsed due to being "undefined".
         * For now it's unclear to me why this is the case, but it seems to be rare
         * so I'm just skipping these posts for now.
         */
        if (!parsedPost) {
            signale.warn(`Could not parse post wih ID: ${postId} -- Skipping.`);
            continue;
        }

        const postMedia = parsedPost.querySelector('.card-attachments');
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
                        signale.success(`Downloaded 'Media' attachment: ${filename} for post titled: ${post.title} (${postId})`);
                    }
                }
            }
        }

        /**
         * Handle saving of "Embed data"
         * If there has been some media embedded.
         */
        const embedData = parsedPost.querySelector('.card-embed');
        if (embedData) {
            /**
             * For now we're just going to save the HTML itself into a file,
             * just so that it's at the very least "saved".
             *
             * Then save any URLs we find into a separate file called `_embed_urls.txt`,
             * which can be fed into `youtube-dl -a _embed_urls.txt` if the user wants to.
             *
             * In the future we might integrate with youtube-dl or similar, or maybe save
             * the data as JSON file for easier parsing... maybe?
             */
            const embedUrls = embedData.querySelectorAll('a');
            const urls = embedUrls.map(link => link.attributes.href);

            /**
             * No need to save a file if no URLs are found.
             * Though this is unlikely to happen.
             */
            if (urls.length > 0) {
                const embedUrlsSave = await _.saveTextFile(outputPath, '_embed_urls.txt', urls.join('\n'));
                if (embedUrlsSave !== null) {
                    signale.success(`Saved related embed URLs (${urls.length}): ${embedUrlsSave} for post titled: ${post.title} (${postId})`);
                }
            }

            const embedBodySave = await _.saveTextFile(outputPath, '_embed_body.html', embedData.toString());
            if (embedBodySave !== null) {
                signale.success(`Saved embed data as HTML: ${embedBodySave} for post titled: ${post.title} (${postId})`);
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
                signale.success(`Downloaded inline (embedded) media file: ${fileName} for post titled: ${post.title} (${postId})`);
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
                signale.success(`Downloaded the attachment file: ${fileName} for post titled: ${post.title} (${postId})`);
            }
        }

        /**
         * Download Patreon post file (usually the header or similar) if it exists.
         */
        const postFile = post.post_file;

        if (postFile.file_url) {
            const postFileSave = await _.downloadFile(postFile.file_url, outputPath, postFile.file_name);
            if (postFileSave !== null) {
                signale.success(`Downloaded the post file: ${postFile.file_name} for post titled: ${post.title} (${postId})`);
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

    signale.timeEnd(downloadTimerName);
})();
