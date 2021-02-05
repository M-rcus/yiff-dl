# Archived
⚠️ **This project has been archived** ⚠️

As yiff.party is no longer up and running, I am archiving this project.  
The alternative as of right now seems to be [Kemono.party](https://kemono.party/) and if you wish to rip Kemono, you can use another 3rd party tool called [gallery-dl](https://github.com/mikf/gallery-dl) (which also supports many other services).

# yiff-dl

Allows you to download all the files (attachments, shared files etc.) and posts from a Patreon creator on [Yiff.party](https://yiff.party/).

This application is kind of created as a quick-and-dirty implementation. While I'd like to spend more time cleaning up the structure of the code, I'm more focused on having a working application (as there aren't any that work that well IMO).

Pull requests are welcome if you'd like to refactor parts (or all!) of the application. 😃

## Installation

Requires [node.js/npm](https://nodejs.org/).  
It has been developed using version [`12.x.x`](https://nodejs.org/en/download/), which is the current LTS (Long-Term Support) version.  
In theory it should work with `v10.x.x` and `v14.x.x`, but no guarantees.

- `npm install -g yiff-dl`
    - Running this command will update `yiff-dl` if there's a new version.
    - `npm` by default installs the latest [npm package version](https://www.npmjs.com/package/yiff-dl).
- [See "Basic usage"](#basic-usage)

### Manual installation

Cloning from git and 'manually' using the project.

- `git clone https://github.com/M-rcus/yiff-dl.git`
- `cd yiff-dl`
- `npm install`
- `node index.js 123456 -o /home/marcus/media/stuff/output/folder/here`

#### Manual installation: Updating

For updating you have to "pull" the new changes and make sure to update dependencies.

- `cd yiff-dl`
- `git pull`
- `npm install`

## Basic usage

As of **version 1.1.0**, yiff-dl can now download creator media based on their Patreon/creator name.

1. Navigate to the directory you want to download to (example: `cd /home/marcus/Downloads/Patreon`)
2. Download using `yiff-dl <creator_name>` (example: `yiff-dl Marcus`).
    - By default downloads into `yiff-dl-output`, see [Parameters](#parameters) on how to override.
3. Wait.

### Alternative

If for some reason the first method didn't work, you can use the alternative method which relies on Yiff's creator ID.  
This is basically the same method as the one used prior to version 1.1.0.

1. Find the creator ID of the creator you want to download from. If the URL is `https://yiff.party/patreon/123456`, then `123456` is the creator ID.
2. Navigate to the directory you want to download to (example: `cd /home/marcus/Downloads/Patreon`)
3. Download using `yiff-dl <creator_id>` (example: `yiff-dl 123456`).
    - By default downloads into `yiff-dl-output`, see [Parameters](#parameters) on how to override.
4. Wait.

## Parameters

yiff-dl allows for some customization using more advanced parameters.

- `--output, -o /data/custom/output/folder` - Specifies a custom output folder - Default: Folder named `yiff-dl-output` in the current working directory, for example: `/data/projects/yiff-dl/yiff-dl-output`
- `--subfolder, -s` - If specified, a subfolder with the creator name is created in the output directory. Example: `/data/projects/yiff-dl/yiff-dl-output/marcus`
- `--user-agent KittyCatMeow/1.0.0` - Specifies a custom user agent - Default (as of 1.0.3): `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0`

## Notes

- There are two HTML/DOM parsers in this project, mainly because I added one in the very beginning of the project and then forgot it existed a few weeks later when I implemented a new feature. Whoops.

## Links

- [Documentation site](https://m-rcus.github.io/yiff-dl/)
    - Hosted on GitHub pages, reads from this `README.md` file!
- [`yiff-dl` on NPM](https://www.npmjs.com/package/yiff-dl)
