const meow = require('meow');
const axios = require('axios');

const cli = meow(`
    Usage
      $ yiff <Patreon_Creator_ID>

    Options
      None yet

    Examples
      $ yiff 3519586
`,
{
    flags: {},
});

if (cli.input.length === 0) {
    console.error('Please specify creator ID!');
    process.exit(1);
}

const creatorId = cli.input[0];

if (/^[\d]+$/.test(creatorId) === false) {
    console.error('Invalid creator ID specified. All creator ID are numerics (example: 3519586).');
    process.exit(1);
}

const client = axios.create({
    method: 'GET',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:68.0) Gecko/20100101 Firefox/68.0',
    },
});

(async function() {
    const getCreatorData = await client(`https://yiff.party/${creatorId}.json`, {
        responseType: 'json',
    });

    // TODO: Parse posts and shared_files
    console.log(getCreatorData.data);
})();