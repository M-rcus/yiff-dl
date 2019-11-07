#!/usr/bin/env node
const meow = require('meow');
const htmlparser = require('node-html-parser');

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
            default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
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

const _ = require('./helpers')(cli);

/**
 * Accept input that is either the creator ID, or the Yiff.party URL (which includes the creator ID).
 */
const removeYiffPrefix = /((http)?(s?)):\/\/yiff\.party(\/patreon)?\//g;
const creatorId = parseInt(cli.input[0].replace(removeYiffPrefix, ''), 10);

if (/^[\d]+$/.test(creatorId) === false) {
    console.error('Invalid creator ID specified. All creator ID are numerics (example: 3519586).');
    process.exit(1);
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
    console.log('Retrieving and filtering through all creators from Yiff to get specific creator details...');
    console.log('This step might take a few seconds, please be patient...');
    const getAllCreators = await _.client('https://yiff.party/json/creators.json', {
        responseType: 'json',
    });

    /**
     * Get certain details about the creator, such as username.
     */
    const creators = getAllCreators.data.creators;
    const creatorDetails = creators.find((creator) => {
        return creator.id === creatorId;
    });

    if (!creatorDetails) {
        console.log(`Could not find creator on Yiff: ${creatorId}`);
        return null;
    }

    console.log('Found creator details:');
    console.log(JSON.stringify(creatorDetails, null, 4));

    /**
     * Get specific posts and shared files related to creator.
     */
    console.log('Getting specific creator data from Yiff (posts, shared files etc.)');
    const getCreatorData = await _.client(`https://yiff.party/${creatorId}.json`, {
        responseType: 'json',
    });
    const { posts, shared_files } = getCreatorData.data;

    const getCreatorPage = await _.client(`https://yiff.party/patreon/${creatorId}`, {
        responseType: 'document',
    });

    const parsedPage = htmlparser.parse(getCreatorPage.data);

    console.log(`Downloading started for creator: ${creatorDetails.name} (${creatorId})`);
    const outputBase = cli.flags.output;

    for (const postIndex in posts) {
        const post = posts[postIndex];

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
            console.error(`An error occurred verifying/creating directory: ${outputPath}`);
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
                console.log(`Shared file metadata has been saved to ${postBodyFile}`);
            }
        }

        const postMedia = parsedPage.querySelector(`#p${post.id} .card-attachments`);
        if (postMedia) {
            const title = postMedia.querySelector('.card-title');
            const textTitle = title ? title.toString() : '';

            if (textTitle.includes('Media')) {
                const links = postMedia.querySelectorAll('a');

                for (const linkIndex in links) {
                    const link = links[linkIndex];
                    const linkUrl = link.attributes.href;
                    const filename = link.innerHTML;

                    if (!linkUrl) {
                        continue;
                    }

                    const mediaAttachment = await _.downloadFile(linkUrl, outputPath, filename);
                    if (mediaAttachment !== null) {
                        console.log(`Downloaded 'Media' attachment: ${filename} for post titled: ${post.title} (${post.id})`);
                    }
                }
            }
        }

        /**
         * Save inline media (images) from the post body.
         */
        const inlineImages = await _.parseInline(post.body);
        for (const imgIndex in inlineImages) {
            const imageUrl = inlineImages[imgIndex];
            const fileName = imageUrl.replace(/.*\//g, '');
            const inlineFile = await _.downloadFile(imageUrl, outputPath, fileName);

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
            const attachmentSave = await _.downloadFile(attachment.file_url, outputPath, fileName);

            if (attachmentSave !== null) {
                console.log(`Downloaded the attachment file: ${fileName} for post titled: ${post.title} (${post.id})`);
            }
        }

        /**
         * Download Patreon post file (usually the header or similar) if it exists.
         */
        const postFile = post.post_file;

        if (postFile.post_file) {
            const postFileSave = await _.downloadFile(postFile.file_url, outputPath, postFile.file_name);
            if (postFileSave !== null) {
                console.log(`Downloaded the post file: ${postFile.file_name} for post titled: ${post.title} (${post.id})`);
            }
        }
    }

    /**
     * Handle downloads of "shared files"
     */
    const outputPath = await _.checkAndCreateDir(`${outputBase}/_SharedFiles`);
    if (outputPath === null) {
        console.error(`An error occurred verifying/creating directory: ${outputPath}`);
    } else {
        for (const sharedIndex in shared_files) {
            const sharedFile = shared_files[sharedIndex];
            const { file_name, file_url, title, description, id } = sharedFile;

            const fileName = `${id}_${file_name}`;
            const metaText = `Title: ${title}\nDescription: ${description === null ? '<None>' : description}`;

            const sharedFileDownload = await _.downloadFile(file_url, outputPath, fileName);

            if (sharedFileDownload !== null) {
                console.log(`Downloaded the shared file: ${fileName} - Title: ${title}`);

                const metaFile = await _.saveTextFile(outputPath, `${fileName}.meta`, metaText);
                if (metaFile !== null) {
                    console.log(`Shared file metadata has been downloaded to ${metaFile}`);
                }
            }
        }
    }
})();
