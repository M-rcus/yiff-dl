const meow = require('meow');
const axios = require('axios');
const downloader = require('js-file-downloader');
const fs = require('fs');

const cli = meow(`
    Usage
      $ yiff-dl <Creator ID or Yiff.party creator URL>

    Options
      --user-agent  Specifies a custom user agent.
      --output, -o  Specifies a custom output folder (default is current working directory).

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
            default: process.cwd(),
        }
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

(async () => {
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

    console.log(creatorDetails);

    /**
     * Get specific posts and shared files related to creator.
     */
    const getCreatorData = await client(`https://yiff.party/${creatorId}.json`, {
        responseType: 'json',
    });
    const { posts, shared_files } = getCreatorData.data;

    /**
     * TODO:
     * - Parse post bodies and make sure that `patreon_inline` URLs are downloaded
     *      - `src="(\/patreon_inline\/${postId}\/[\w-]+\.[A-z]{2,6})"`
     * - Download `attachments`
     * - Download `post_file`
     * - Download `shared_files`
     */
    console.log(getCreatorData.data);
})();
