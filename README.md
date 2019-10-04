# yiff-dl

Allows you to download all the files (attachments, shared files etc.) and posts from a Patreon creator on [Yiff.party](https://yiff.party/).

This application is kind of created as a quick-and-dirty implementation. While I'd like to spend more time cleaning up the structure of the code, I'm more focused on having a working application (as there aren't any that work that well IMO).

Pull requests are welcome if you'd like to refactor parts (or all!) of the application. :smiley:

## Usage

1. Find the creator ID of the creator you want to download from. If the URL is `https://yiff.party/patreon/123456`, then `123456` is the creator ID.
2. Navigate to the directory you want to download to (example: `cd /home/marcus/Downloads/Patreon`)
3. Download using `yiff-dl <creator_id>` (example: `yiff-dl 123456`).
4. Wait.
