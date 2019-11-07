# yiff-dl

Allows you to download all the files (attachments, shared files etc.) and posts from a Patreon creator on [Yiff.party](https://yiff.party/).

This application is kind of created as a quick-and-dirty implementation. While I'd like to spend more time cleaning up the structure of the code, I'm more focused on having a working application (as there aren't any that work that well IMO).

Pull requests are welcome if you'd like to refactor parts (or all!) of the application. :smiley:

## Installation

Requires [node.js/npm](https://nodejs.org/).

- `npm install -g yiff-dl`
- [See "Basic usage"](#basic-usage)

### Manual installation

Cloning from git and 'manually' using the project.

- `git clone https://github.com/M-rcus/yiff-dl.git`
- `cd yiff-dl`
- `npm install`
- `node index.js 123456 -o /home/marcus/media/stuff/output/folder/here`

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

- `--output, -o $outputFolder` - Specifies a custom output folder - Default: Folder named `yiff-dl-output` in the current working directory, for example: `/data/projects/yiff-dl/yiff-dl-output`
- `--subfolder, -s` - If specified, a subfolder with the creator name is created in the output directory. Example: `/data/projects/yiff-dl/yiff-dl-output/marcus`
- `--user-agent $userAgent` - Specifies a custom user agent - Default (as of 1.0.3): `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0`

## Notes

- There are two HTML/DOM parsers in this project, mainly because I added one in the very beginning of the project and then forgot it existed a few weeks later when I implemented a new feature. Whoops.
